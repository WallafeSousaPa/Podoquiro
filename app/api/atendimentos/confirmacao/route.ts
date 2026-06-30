import { NextResponse } from "next/server";
import {
  getPodeVerTodosAgendamentos,
  getUsuarioAgendaSomentePropriaColuna,
} from "@/lib/agenda/permissoes-calendario";
import { getSession } from "@/lib/auth/session";
import { obterConfigRede } from "@/lib/rede";
import { normalizarUrlCheckoutPaymentLinkRede } from "@/lib/rede/payment-link";
import { sincronizarTaxaComPaymentLinkRede } from "@/lib/rede/sincronizar-taxa-payment-link";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nomeExibicaoPaciente(p: {
  nome_completo?: string | null;
  nome_social?: string | null;
  telefone?: string | null;
}, idPaciente: number): string {
  const nc = p.nome_completo != null ? String(p.nome_completo).trim() : "";
  const ns = p.nome_social != null ? String(p.nome_social).trim() : "";
  const tel = p.telefone != null ? String(p.telefone).trim() : "";
  return nc || ns || tel || `Paciente #${idPaciente}`;
}

/** Lista agendamentos pendentes/confirmados para confirmação (próximos dias). */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status")?.trim() ?? "pendente";
  const dias = Math.min(Math.max(Number(url.searchParams.get("dias") ?? 30), 1), 90);

  const statusList =
    statusParam === "todos"
      ? (["pendente", "confirmado"] as const)
      : statusParam === "confirmado"
        ? (["confirmado"] as const)
        : (["pendente"] as const);

  const supabase = createAdminClient();
  const [podeVerTodos, somentePropriaColuna] = await Promise.all([
    getPodeVerTodosAgendamentos(supabase, sessionUserId),
    getUsuarioAgendaSomentePropriaColuna(supabase, sessionUserId),
  ]);

  const agora = new Date();
  const limite = new Date(agora);
  limite.setDate(limite.getDate() + dias);

  let q = supabase
    .from("agendamentos")
    .select(
      `
      id,
      id_usuario,
      id_paciente,
      id_sala,
      data_hora_inicio,
      data_hora_fim,
      status,
      observacoes,
      pacientes ( nome_completo, nome_social, telefone ),
      usuarios ( nome_completo, usuario ),
      salas ( nome_sala ),
      agendamento_taxa_rede ( id, token, valor, status, expira_em, created_at, rede_payment_link_id, rede_payment_link_url, id_agendamento )
    `,
    )
    .eq("id_empresa", empresaId)
    .in("status", [...statusList])
    .gte("data_hora_inicio", agora.toISOString())
    .lte("data_hora_inicio", limite.toISOString())
    .order("data_hora_inicio", { ascending: true });

  if (!podeVerTodos || somentePropriaColuna) {
    q = q.eq("id_usuario", sessionUserId);
  }

  let { data, error } = await q;
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: empRow } = await supabase
    .from("empresas")
    .select("taxa_agendamento_valor, nome_fantasia")
    .eq("id", empresaId)
    .maybeSingle();

  const taxaPadrao = Number(empRow?.taxa_agendamento_valor ?? 0);

  type TaxaRow = {
    id: number;
    token: string;
    valor: number;
    status: string;
    expira_em: string | null;
    created_at: string;
    rede_payment_link_id: string | null;
    rede_payment_link_url: string | null;
    id_agendamento: number;
  };

  const redeConfig = obterConfigRede();
  if (redeConfig) {
    const pendentes = (data ?? [])
      .flatMap((row) => {
        const taxasRaw = row.agendamento_taxa_rede as TaxaRow | TaxaRow[] | null;
        const taxas = Array.isArray(taxasRaw) ? taxasRaw : taxasRaw ? [taxasRaw] : [];
        return taxas.filter((t) => t.status === "pendente" && t.rede_payment_link_id);
      })
      .slice(0, 15);

    const results = await Promise.allSettled(
      pendentes.map((t) =>
        sincronizarTaxaComPaymentLinkRede(supabase, redeConfig, {
          id: t.id,
          id_agendamento: t.id_agendamento,
          status: t.status,
          rede_payment_link_id: t.rede_payment_link_id,
        }),
      ),
    );

    const houveAtualizacao = results.some(
      (r) => r.status === "fulfilled" && r.value.atualizado,
    );
    if (houveAtualizacao) {
      const refreshed = await q;
      if (!refreshed.error && refreshed.data) {
        data = refreshed.data;
      }
    }
  }

  const rows = (data ?? []).map((row) => {
    const pacRaw = row.pacientes as
      | { nome_completo: string | null; nome_social: string | null; telefone: string | null }
      | { nome_completo: string | null; nome_social: string | null; telefone: string | null }[]
      | null;
    const pac = Array.isArray(pacRaw) ? pacRaw[0] : pacRaw;
    const profRaw = row.usuarios as
      | { nome_completo: string | null; usuario: string }
      | { nome_completo: string | null; usuario: string }[]
      | null;
    const prof = Array.isArray(profRaw) ? profRaw[0] : profRaw;
    const salaRaw = row.salas as { nome_sala: string } | { nome_sala: string }[] | null;
    const sala = Array.isArray(salaRaw) ? salaRaw[0] : salaRaw;

    const taxasRaw = row.agendamento_taxa_rede as TaxaRow | TaxaRow[] | null;
    const taxas = Array.isArray(taxasRaw) ? taxasRaw : taxasRaw ? [taxasRaw] : [];
    const taxaAtiva = taxas
      .filter((t) => t.status === "pendente")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

    return {
      id: row.id as number,
      id_usuario: row.id_usuario as number,
      id_paciente: row.id_paciente as number,
      data_hora_inicio: row.data_hora_inicio as string,
      data_hora_fim: row.data_hora_fim as string,
      status: row.status as string,
      observacoes: row.observacoes as string | null,
      paciente_nome: pac
        ? nomeExibicaoPaciente(pac, row.id_paciente as number)
        : `Paciente #${row.id_paciente}`,
      paciente_telefone: pac?.telefone ?? null,
      profissional_nome:
        prof?.nome_completo?.trim() || prof?.usuario?.trim() || `Profissional #${row.id_usuario}`,
      nome_sala: sala?.nome_sala ?? "—",
      taxa_pagamento: taxaAtiva
        ? {
            id: taxaAtiva.id,
            token: taxaAtiva.token,
            valor: Number(taxaAtiva.valor),
            status: taxaAtiva.status,
            expira_em: taxaAtiva.expira_em,
            link_rede:
              redeConfig && taxaAtiva.rede_payment_link_url
                ? normalizarUrlCheckoutPaymentLinkRede(
                    taxaAtiva.rede_payment_link_url,
                    redeConfig,
                  )
                : taxaAtiva.rede_payment_link_url,
          }
        : null,
    };
  });

  return NextResponse.json({
    data: rows,
    taxa_agendamento_padrao: taxaPadrao,
    nome_empresa: empRow?.nome_fantasia?.trim() || null,
  });
}
