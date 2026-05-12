import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaixaAgendamentoRow } from "@/app/(dashboard)/financeiro/caixa/caixa-client";

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

function nomeProfissional(
  u:
    | { nome_completo?: string | null; usuario?: string | null }
    | null
    | undefined,
): string {
  const nc = u?.nome_completo != null ? String(u.nome_completo).trim() : "";
  const us = u?.usuario != null ? String(u.usuario).trim() : "";
  return nc || us || "—";
}

/** Início e fim do dia civil em Brasília (UTC−3, sem horário de verão), em ISO para o Postgres. */
export function intervaloDiaBrasiliaIso(dataYmd: string): {
  inicioIso: string;
  fimIso: string;
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataYmd.trim());
  if (!m) {
    throw new Error("Data inválida. Use AAAA-MM-DD.");
  }
  const inicio = new Date(`${dataYmd}T00:00:00-03:00`);
  const fim = new Date(`${dataYmd}T23:59:59.999-03:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    throw new Error("Data inválida.");
  }
  return { inicioIso: inicio.toISOString(), fimIso: fim.toISOString() };
}

/**
 * Agendamentos do dia `dataYmd` (qualquer status do agendamento), com todos os pagamentos
 * vinculados (todos os status de pagamento), para a empresa e escopo do usuário.
 */
export async function carregarCaixaAgendamentosRows(
  supabase: SupabaseClient,
  params: {
    empresaId: number;
    sessionUserId: number;
    podeVerTodosAgendamentos: boolean;
    dataYmd: string;
  },
): Promise<CaixaAgendamentoRow[]> {
  const { empresaId, sessionUserId, podeVerTodosAgendamentos, dataYmd } =
    params;
  const { inicioIso, fimIso } = intervaloDiaBrasiliaIso(dataYmd);

  let q = supabase
    .from("agendamentos")
    .select(
      `
        id,
        id_usuario,
        data_hora_inicio,
        data_hora_fim,
        status,
        valor_bruto,
        desconto,
        valor_total,
        pacientes ( nome_completo, nome_social ),
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
    .eq("id_empresa", empresaId)
    .gte("data_hora_inicio", inicioIso)
    .lte("data_hora_inicio", fimIso);

  if (!podeVerTodosAgendamentos) {
    q = q.eq("id_usuario", sessionUserId);
  }

  const { data, error } = await q
    .order("data_hora_inicio", { ascending: true })
    .order("id", { ascending: true })
    .limit(500);

  if (error) throw new Error(error.message);

  const rows: CaixaAgendamentoRow[] = (data ?? []).map((raw) => {
    const pacRaw = raw.pacientes as
      | { nome_completo: string | null; nome_social: string | null }
      | { nome_completo: string | null; nome_social: string | null }[]
      | null;
    const pac = Array.isArray(pacRaw) ? pacRaw[0] : pacRaw;

    const usrRaw = raw.usuarios as
      | { nome_completo: string | null; usuario: string | null }
      | { nome_completo: string | null; usuario: string | null }[]
      | null;
    const usr = Array.isArray(usrRaw) ? usrRaw[0] : usrRaw;

    const salaRaw = raw.salas as
      | { nome_sala: string | null }
      | { nome_sala: string | null }[]
      | null;
    const sala = Array.isArray(salaRaw) ? salaRaw[0] : salaRaw;

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

    const pagsRaw = raw.pagamentos as
      | {
          valor_pago: number;
          status_pagamento: string;
          formas_pagamento:
            | { nome: string | null }
            | { nome: string | null }[]
            | null;
          maquinetas: { nome: string | null } | { nome: string | null }[] | null;
        }[]
      | null;

    const pagamentos = (pagsRaw ?? []).map((pg) => {
        const fp = pg.formas_pagamento;
        const fp0 = Array.isArray(fp) ? fp[0] : fp;
        const mq = pg.maquinetas;
        const mq0 = Array.isArray(mq) ? mq[0] : mq;
        return {
          forma: fp0?.nome ?? null,
          maquineta: mq0?.nome ?? null,
          valor_pago: Number(pg.valor_pago),
          status_pagamento: String(pg.status_pagamento),
        };
    });

    return {
      id: raw.id as number,
      id_usuario: raw.id_usuario as number,
      data_hora_inicio: raw.data_hora_inicio as string,
      data_hora_fim: raw.data_hora_fim as string,
      status: String(raw.status),
      valor_bruto: Number(raw.valor_bruto),
      desconto: Number(raw.desconto),
      valor_total: Number(raw.valor_total),
      paciente_nome: nomePaciente(pac),
      profissional_nome: nomeProfissional(usr),
      nome_sala: sala?.nome_sala?.trim() || "—",
      procedimentos,
      pagamentos,
    };
  });

  return rows;
}
