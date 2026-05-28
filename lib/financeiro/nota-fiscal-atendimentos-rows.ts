import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaixaAgendamentoRow } from "@/app/(dashboard)/financeiro/caixa/caixa-client";
import { agendamentoPagamentoQuitado } from "@/lib/financeiro/agendamento-pagamento-quitado";
import { buscarPacientesPorNomeEmpresa } from "@/lib/pacientes/buscar-pacientes-nome-empresa";
import { dayStartIsoBr, nextDayStartIsoBr } from "@/lib/relatorios/periodo";

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

export type NotaFiscalAtendimentoRow = CaixaAgendamentoRow & {
  id_paciente: number;
};

/**
 * Agendamentos **realizados** no período, com pagamento quitado (todos `pago`).
 * Opcional: filtrar por nome do paciente (busca ILIKE, mín. 2 caracteres).
 */
export async function carregarNotaFiscalAtendimentosRows(
  supabase: SupabaseClient,
  params: {
    empresaId: number;
    sessionUserId: number;
    podeVerTodosAgendamentos: boolean;
    dataInicio: string;
    dataFim: string;
    pacienteBusca?: string;
  },
): Promise<NotaFiscalAtendimentoRow[]> {
  const {
    empresaId,
    sessionUserId,
    podeVerTodosAgendamentos,
    dataInicio,
    dataFim,
    pacienteBusca = "",
  } = params;

  const inicioIso = dayStartIsoBr(dataInicio);
  const fimExclusivoIso = nextDayStartIsoBr(dataFim);

  let idsPaciente: number[] | null = null;
  const termo = pacienteBusca.trim();
  if (termo.length >= 2) {
    const { data: pacientes, error } = await buscarPacientesPorNomeEmpresa(
      supabase,
      empresaId,
      termo,
      120,
    );
    if (error) throw new Error(error);
    idsPaciente = pacientes.map((p) => p.id);
    if (idsPaciente.length === 0) return [];
  }

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
    .eq("status", "realizado")
    .gte("data_hora_inicio", inicioIso)
    .lt("data_hora_inicio", fimExclusivoIso);

  if (!podeVerTodosAgendamentos) {
    q = q.eq("id_usuario", sessionUserId);
  }

  if (idsPaciente) {
    q = q.in("id_paciente", idsPaciente);
  }

  const { data, error } = await q
    .order("data_hora_inicio", { ascending: false })
    .order("id", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  const rows: NotaFiscalAtendimentoRow[] = (data ?? [])
    .map((raw) => {
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
        id_paciente: raw.id_paciente as number,
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
    })
    .filter((r) => agendamentoPagamentoQuitado(r.pagamentos));

  return rows;
}
