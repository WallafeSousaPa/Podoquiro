import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assinarFotosProntuario,
  parsePathsFotosProntuario,
} from "@/lib/prontuario/fotos-storage";

export type HistoricoAtendimentoResumo = {
  id_agendamento: number;
  status: string;
  data_hora_inicio: string;
  data_hora_fim: string;
  responsavel_nome: string;
  procedimentos: { id_procedimento: number; nome: string }[];
  evolucao: string;
  observacoes_agendamento: string | null;
  qtd_fotos: number;
  tem_prontuario: boolean;
};

export type HistoricoAtendimentoDetalhe = HistoricoAtendimentoResumo & {
  fotos: { path: string; url: string }[];
  data_registro: string | null;
  procedimentos_agendamento: { id_procedimento: number; nome: string }[];
};

export function rotuloStatusAgendamentoHistorico(status: string): string {
  const map: Record<string, string> = {
    pendente: "Pendente",
    confirmado: "Confirmado",
    em_andamento: "Em andamento",
    realizado: "Realizado",
    cancelado: "Cancelado",
    faltou: "Faltou",
    adiado: "Adiado",
    curativo_agendado: "Curativo agendado",
  };
  return map[status] ?? status.replace(/_/g, " ");
}

function parseIdsProcedimentos(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids: number[] = [];
  for (const x of raw) {
    const n = Number(x);
    if (Number.isFinite(n) && n > 0) ids.push(n);
  }
  return ids;
}

function parsePathsFotos(raw: unknown): string[] {
  return parsePathsFotosProntuario(raw);
}

type ProntuarioEmbed = {
  evolucao: string | null;
  fotos: unknown;
  procedimentos_realizados: unknown;
  data_registro?: string | null;
};

function extrairProntuarioEmbed(
  raw:
    | ProntuarioEmbed
    | ProntuarioEmbed[]
    | null
    | undefined,
): ProntuarioEmbed | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

type UsuarioEmbed = {
  nome_completo?: string | null;
  usuario?: string | null;
};

function extrairUsuarioEmbed(
  raw: UsuarioEmbed | UsuarioEmbed[] | null | undefined,
): UsuarioEmbed | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

export function nomeResponsavelAtendimentoHistorico(
  u: UsuarioEmbed | null,
): string {
  if (!u) return "Profissional não informado";
  const nc = u.nome_completo?.trim();
  if (nc) return nc;
  return u.usuario?.trim() || "Profissional não informado";
}

async function mapNomesProcedimentos(
  supabase: SupabaseClient,
  empresaId: number,
  ids: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("procedimentos")
    .select("id, procedimento")
    .eq("id_empresa", empresaId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    map.set(row.id as number, String(row.procedimento ?? "—"));
  }
  return map;
}

async function mapProcedimentosPorAgendamento(
  supabase: SupabaseClient,
  idsAgendamento: number[],
): Promise<Map<number, { id_procedimento: number; nome: string }[]>> {
  const porAg = new Map<number, { id_procedimento: number; nome: string }[]>();
  if (idsAgendamento.length === 0) return porAg;

  const { data, error } = await supabase
    .from("agendamento_procedimentos")
    .select("id_agendamento, id_procedimento, procedimentos ( procedimento )")
    .in("id_agendamento", idsAgendamento);

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const idAg = row.id_agendamento as number;
    const idProc = row.id_procedimento as number;
    const pr = row.procedimentos as
      | { procedimento: string }
      | { procedimento: string }[]
      | null;
    const p = Array.isArray(pr) ? pr[0] : pr;
    const nome = p?.procedimento ?? "—";
    const lista = porAg.get(idAg) ?? [];
    lista.push({ id_procedimento: idProc, nome: String(nome) });
    porAg.set(idAg, lista);
  }
  return porAg;
}

function montarListaProcedimentos(
  idsRealizados: number[],
  procedimentosAg: { id_procedimento: number; nome: string }[],
  nomesProc: Map<number, string>,
): { id_procedimento: number; nome: string }[] {
  if (idsRealizados.length > 0) {
    return idsRealizados.map((id) => ({
      id_procedimento: id,
      nome: nomesProc.get(id) ?? `Procedimento #${id}`,
    }));
  }
  return procedimentosAg;
}

/**
 * Todos os agendamentos anteriores do paciente (qualquer status), com dados do agendamento
 * e do prontuário quando existir.
 */
export async function listarHistoricoProntuarioPaciente(
  supabase: SupabaseClient,
  args: {
    idEmpresa: number;
    idPaciente: number;
    excluirIdAgendamento?: number;
    limite?: number;
  },
): Promise<HistoricoAtendimentoResumo[]> {
  const limite = args.limite ?? 50;

  let q = supabase
    .from("agendamentos")
    .select(
      `
      id,
      status,
      data_hora_inicio,
      data_hora_fim,
      observacoes,
      usuarios ( nome_completo, usuario ),
      prontuario_paciente (
        evolucao,
        fotos,
        procedimentos_realizados
      )
    `,
    )
    .eq("id_empresa", args.idEmpresa)
    .eq("id_paciente", args.idPaciente)
    .order("data_hora_inicio", { ascending: false })
    .limit(limite);

  if (args.excluirIdAgendamento != null) {
    q = q.neq("id", args.excluirIdAgendamento);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const idsAg = rows.map((r) => r.id as number);
  const procsPorAg = await mapProcedimentosPorAgendamento(supabase, idsAg);

  const todosIdsProc: number[] = [];
  for (const row of rows) {
    const pr = extrairProntuarioEmbed(
      row.prontuario_paciente as ProntuarioEmbed | ProntuarioEmbed[] | null,
    );
    const idsRealizados = parseIdsProcedimentos(pr?.procedimentos_realizados);
    if (idsRealizados.length > 0) {
      todosIdsProc.push(...idsRealizados);
    } else {
      for (const p of procsPorAg.get(row.id as number) ?? []) {
        todosIdsProc.push(p.id_procedimento);
      }
    }
  }
  const nomesProc = await mapNomesProcedimentos(
    supabase,
    args.idEmpresa,
    [...new Set(todosIdsProc)],
  );

  return rows.map((row) => {
    const idAg = row.id as number;
    const pr = extrairProntuarioEmbed(
      row.prontuario_paciente as ProntuarioEmbed | ProntuarioEmbed[] | null,
    );
    const idsRealizados = parseIdsProcedimentos(pr?.procedimentos_realizados);
    const procsAg = procsPorAg.get(idAg) ?? [];
    const paths = parsePathsFotos(pr?.fotos);

    const usuario = extrairUsuarioEmbed(
      row.usuarios as UsuarioEmbed | UsuarioEmbed[] | null,
    );

    return {
      id_agendamento: idAg,
      status: String(row.status ?? ""),
      data_hora_inicio: String(row.data_hora_inicio),
      data_hora_fim: String(row.data_hora_fim),
      responsavel_nome: nomeResponsavelAtendimentoHistorico(usuario),
      procedimentos: montarListaProcedimentos(idsRealizados, procsAg, nomesProc),
      evolucao: String(pr?.evolucao ?? "").trim(),
      observacoes_agendamento:
        row.observacoes != null && String(row.observacoes).trim()
          ? String(row.observacoes).trim()
          : null,
      qtd_fotos: paths.length,
      tem_prontuario: pr != null,
    };
  });
}

export async function carregarDetalheHistoricoProntuario(
  supabase: SupabaseClient,
  args: { idEmpresa: number; idAgendamento: number; idPaciente: number },
): Promise<HistoricoAtendimentoDetalhe | null> {
  const { data: row, error } = await supabase
    .from("agendamentos")
    .select(
      `
      id,
      id_paciente,
      status,
      data_hora_inicio,
      data_hora_fim,
      observacoes,
      usuarios ( nome_completo, usuario ),
      prontuario_paciente (
        evolucao,
        fotos,
        procedimentos_realizados,
        data_registro
      )
    `,
    )
    .eq("id", args.idAgendamento)
    .eq("id_empresa", args.idEmpresa)
    .eq("id_paciente", args.idPaciente)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) return null;

  const pr = extrairProntuarioEmbed(
    row.prontuario_paciente as ProntuarioEmbed | ProntuarioEmbed[] | null,
  );
  const procsPorAg = await mapProcedimentosPorAgendamento(supabase, [
    args.idAgendamento,
  ]);
  const procsAg = procsPorAg.get(args.idAgendamento) ?? [];

  const idsRealizados = parseIdsProcedimentos(pr?.procedimentos_realizados);
  const todosIds = [
    ...new Set([
      ...idsRealizados,
      ...procsAg.map((p) => p.id_procedimento),
    ]),
  ];
  const nomesProc = await mapNomesProcedimentos(supabase, args.idEmpresa, todosIds);

  const paths = parsePathsFotos(pr?.fotos);
  const fotos = await assinarFotosProntuario(supabase, paths);
  const usuario = extrairUsuarioEmbed(
    row.usuarios as UsuarioEmbed | UsuarioEmbed[] | null,
  );

  return {
    id_agendamento: row.id as number,
    status: String(row.status ?? ""),
    data_hora_inicio: String(row.data_hora_inicio),
    data_hora_fim: String(row.data_hora_fim),
    responsavel_nome: nomeResponsavelAtendimentoHistorico(usuario),
    procedimentos: montarListaProcedimentos(idsRealizados, procsAg, nomesProc),
    procedimentos_agendamento: procsAg,
    evolucao: String(pr?.evolucao ?? "").trim(),
    observacoes_agendamento:
      row.observacoes != null && String(row.observacoes).trim()
        ? String(row.observacoes).trim()
        : null,
    qtd_fotos: paths.length,
    tem_prontuario: pr != null,
    fotos,
    data_registro: pr?.data_registro != null ? String(pr.data_registro) : null,
  };
}
