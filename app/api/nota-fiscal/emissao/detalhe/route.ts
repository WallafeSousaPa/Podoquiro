import { NextResponse } from "next/server";
import { getPodeVerTodosAgendamentos } from "@/lib/agenda/permissoes-calendario";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNotaFiscal } from "@/lib/dashboard/nota-fiscal-permissao";
import { agendamentoPagamentoQuitado } from "@/lib/financeiro/agendamento-pagamento-quitado";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nomePaciente(
  p:
    | { nome_completo?: string | null; nome_social?: string | null }
    | null
    | undefined,
): string {
  const nc = p?.nome_completo != null ? String(p.nome_completo).trim() : "";
  const ns = p?.nome_social != null ? String(p.nome_social).trim() : "";
  return nc || ns || "—";
}

/** Detalhes do agendamento + paciente para modal de emissão NFS-e. */
export async function GET(req: Request) {
  const session = await getSession();
  const negado = await respostaSeSemPermissaoNotaFiscal(session);
  if (negado) return negado;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  const idAgendamento = Number(new URL(req.url).searchParams.get("id_agendamento"));

  if (!Number.isFinite(idAgendamento) || idAgendamento <= 0) {
    return NextResponse.json({ error: "Informe id_agendamento." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const podeVerTodos = await getPodeVerTodosAgendamentos(supabase, sessionUserId);

  let q = supabase
    .from("agendamentos")
    .select(
      `
        id,
        id_paciente,
        id_usuario,
        data_hora_inicio,
        data_hora_fim,
        status,
        valor_bruto,
        desconto,
        valor_total,
        observacoes,
        pacientes (
          id, cpf, nome_completo, nome_social, email, telefone,
          cep, logradouro, numero, complemento, bairro, cidade, uf
        ),
        usuarios!agendamentos_id_usuario_fkey ( nome_completo, usuario ),
        salas ( nome_sala ),
        agendamento_procedimentos (
          valor_aplicado,
          procedimentos ( procedimento )
        ),
        pagamentos (
          valor_pago,
          status_pagamento,
          formas_pagamento ( nome ),
          maquinetas ( nome )
        )
      `,
    )
    .eq("id", idAgendamento)
    .eq("id_empresa", empresaId);

  if (!podeVerTodos) {
    q = q.eq("id_usuario", sessionUserId);
  }

  const { data: raw, error } = await q.maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!raw) {
    return NextResponse.json({ error: "Atendimento não encontrado." }, { status: 404 });
  }

  if (String(raw.status) !== "realizado") {
    return NextResponse.json(
      { error: "Só é possível emitir NFS-e para atendimentos realizados." },
      { status: 400 },
    );
  }

  const pagsRaw = raw.pagamentos as
    | { valor_pago: number; status_pagamento: string }[]
    | null;
  const pagamentos = (pagsRaw ?? []).map((pg) => ({
    valor_pago: Number(pg.valor_pago),
    status_pagamento: String(pg.status_pagamento),
  }));

  if (!agendamentoPagamentoQuitado(pagamentos)) {
    return NextResponse.json(
      { error: "O atendimento precisa estar com pagamento quitado no caixa." },
      { status: 400 },
    );
  }

  const pacRaw = raw.pacientes as
    | {
        id: number;
        cpf: string | null;
        nome_completo: string | null;
        nome_social: string | null;
        email: string | null;
        telefone: string | null;
        cep: string | null;
        logradouro: string | null;
        numero: string | null;
        complemento: string | null;
        bairro: string | null;
        cidade: string | null;
        uf: string | null;
      }
    | {
        id: number;
        cpf: string | null;
        nome_completo: string | null;
        nome_social: string | null;
        email: string | null;
        telefone: string | null;
        cep: string | null;
        logradouro: string | null;
        numero: string | null;
        complemento: string | null;
        bairro: string | null;
        cidade: string | null;
        uf: string | null;
      }[]
    | null;
  const pac = Array.isArray(pacRaw) ? pacRaw[0] : pacRaw;

  const procsRaw = raw.agendamento_procedimentos as
    | {
        valor_aplicado: number;
        procedimentos:
          | { procedimento: string | null }
          | { procedimento: string | null }[]
          | null;
      }[]
    | null;

  const procedimentos = (procsRaw ?? []).map((ap) => {
    const pr = ap.procedimentos;
    const p0 = Array.isArray(pr) ? pr[0] : pr;
    return {
      procedimento: p0?.procedimento ?? null,
      valor_aplicado: Number(ap.valor_aplicado),
    };
  });

  const { data: emissao } = await supabase
    .from("nfse_focus_emissoes")
    .select(
      "id, focus_ref, status, numero_nfse, codigo_verificacao, numero_rps, serie_rps, valor_servicos, discriminacao, url_danfse, error_message, created_at, updated_at",
    )
    .eq("id_empresa", empresaId)
    .eq("id_agendamento", idAgendamento)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const usrRaw = raw.usuarios as
    | { nome_completo: string | null; usuario: string | null }
    | { nome_completo: string | null; usuario: string | null }[]
    | null;
  const usr = Array.isArray(usrRaw) ? usrRaw[0] : usrRaw;

  const salaRaw = raw.salas as { nome_sala: string | null } | { nome_sala: string | null }[] | null;
  const sala = Array.isArray(salaRaw) ? salaRaw[0] : salaRaw;

  return NextResponse.json({
    agendamento: {
      id: raw.id,
      id_paciente: raw.id_paciente,
      data_hora_inicio: raw.data_hora_inicio,
      data_hora_fim: raw.data_hora_fim,
      valor_total: Number(raw.valor_total),
      valor_bruto: Number(raw.valor_bruto),
      desconto: Number(raw.desconto),
      observacoes: raw.observacoes,
      profissional_nome:
        usr?.nome_completo?.trim() || usr?.usuario?.trim() || "—",
      nome_sala: sala?.nome_sala?.trim() || "—",
      procedimentos,
      pagamentos: (pagsRaw ?? []).map((pg) => {
        const fp = pg as {
          valor_pago: number;
          status_pagamento: string;
          formas_pagamento: { nome: string | null } | { nome: string | null }[];
          maquinetas: { nome: string | null } | { nome: string | null }[];
        };
        const f0 = Array.isArray(fp.formas_pagamento)
          ? fp.formas_pagamento[0]
          : fp.formas_pagamento;
        const m0 = Array.isArray(fp.maquinetas) ? fp.maquinetas[0] : fp.maquinetas;
        return {
          valor_pago: Number(fp.valor_pago),
          status_pagamento: String(fp.status_pagamento),
          forma: f0?.nome ?? null,
          maquineta: m0?.nome ?? null,
        };
      }),
    },
    paciente: pac
      ? {
          id: pac.id,
          nome: nomePaciente(pac),
          cpf: pac.cpf,
          email: pac.email,
          telefone: pac.telefone,
          cep: pac.cep,
          logradouro: pac.logradouro,
          numero: pac.numero,
          complemento: pac.complemento,
          bairro: pac.bairro,
          cidade: pac.cidade,
          uf: pac.uf,
        }
      : null,
    nfse: emissao ?? null,
  });
}
