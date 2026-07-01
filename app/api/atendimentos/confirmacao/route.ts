import { NextResponse } from "next/server";
import {
  getPodeVerTodosAgendamentos,
  getUsuarioAgendaSomentePropriaColuna,
} from "@/lib/agenda/permissoes-calendario";
import { obterConfigAsaas } from "@/lib/asaas";
import { sincronizarTaxaComPaymentLinkAsaas } from "@/lib/asaas/sincronizar-taxa";
import { getSession } from "@/lib/auth/session";
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

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const deParam = url.searchParams.get("de")?.trim();
  const ateParam = url.searchParams.get("ate")?.trim();
  const de = deParam && DATE_RE.test(deParam) ? deParam : hoje;
  const ate = ateParam && DATE_RE.test(ateParam) ? ateParam : de;
  const inicioIso = `${de}T00:00:00.000-03:00`;
  const fimIso = `${ate}T23:59:59.999-03:00`;

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
      agendamento_taxa_rede ( id, token, valor, status, expira_em, pago_em, created_at, asaas_payment_link_id, asaas_payment_link_url, id_agendamento )
    `,
    )
    .eq("id_empresa", empresaId)
    .in("status", [...statusList])
    .gte("data_hora_inicio", inicioIso)
    .lte("data_hora_inicio", fimIso)
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
    pago_em: string | null;
    created_at: string;
    asaas_payment_link_id: string | null;
    asaas_payment_link_url: string | null;
    id_agendamento: number;
  };

  const asaasConfig = obterConfigAsaas();
  if (asaasConfig) {
    const pendentes = (data ?? [])
      .flatMap((row) => {
        const taxasRaw = row.agendamento_taxa_rede as TaxaRow | TaxaRow[] | null;
        const taxas = Array.isArray(taxasRaw) ? taxasRaw : taxasRaw ? [taxasRaw] : [];
        return taxas.filter((t) => t.status === "pendente" && t.asaas_payment_link_id);
      })
      .slice(0, 15);

    const results = await Promise.allSettled(
      pendentes.map((t) =>
        sincronizarTaxaComPaymentLinkAsaas(supabase, asaasConfig, {
          id: t.id,
          id_agendamento: t.id_agendamento,
          status: t.status,
          asaas_payment_link_id: t.asaas_payment_link_id,
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
    const porRecencia = [...taxas].sort((a, b) => b.created_at.localeCompare(a.created_at));
    // Prioriza taxa paga; senão, a mais recente (pendente/expirada/cancelada).
    const taxaAtiva = porRecencia.find((t) => t.status === "pago") ?? porRecencia[0] ?? null;

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
            pago_em: taxaAtiva.pago_em,
            link_asaas: taxaAtiva.asaas_payment_link_url,
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
