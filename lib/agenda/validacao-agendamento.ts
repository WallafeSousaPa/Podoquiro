import type { SupabaseClient } from "@supabase/supabase-js";

export const MSG_HORARIO_RETROATIVO =
  "Não é permitido agendar em data ou horário retroativos. O início do atendimento deve ser igual ou posterior ao horário atual.";

export const MSG_CONFLITO_PROFISSIONAL =
  "Já existe um agendamento para este responsável neste horário. Escolha outro intervalo que não se sobreponha a um agendamento existente.";

export const MSG_PROCEDIMENTO_DUPLICADO =
  "Não é permitido repetir o mesmo procedimento mais de uma vez no mesmo agendamento.";

/** Cancelado ou faltou: validação de intervalo início/fim e conflitos de agenda não se aplicam como nos demais status. */
export function statusAgendamentoIgnoraValidacaoHorario(status: string): boolean {
  return status === "cancelado" || status === "faltou";
}

/** Mantém um único registro por id_procedimento (evita violação de unique no banco). */
export function dedupeProcedimentos(
  items: { id_procedimento: number; valor_aplicado: number }[],
): { id_procedimento: number; valor_aplicado: number }[] {
  const map = new Map<number, { id_procedimento: number; valor_aplicado: number }>();
  for (const p of items) {
    map.set(p.id_procedimento, p);
  }
  return [...map.values()];
}

/** Status em que o intervalo ainda “ocupa” o profissional para fins de conflito de agenda. */
const STATUS_AGENDA_OCUPA_SLOT = [
  "pendente",
  "confirmado",
  "em_andamento",
  "realizado",
  "adiado",
] as const;

const STATUS_AGENDA_OCUPA_SLOT_SET = new Set<string>(STATUS_AGENDA_OCUPA_SLOT);

export type LinhaSobreposicaoAgenda = {
  id: number;
  status: string;
  data_hora_inicio: string;
  data_hora_fim: string;
};

/** True se este status faz o intervalo contar como ocupado na agenda do profissional. */
export function statusAgendaOcupacaoSlot(status: string): boolean {
  return STATUS_AGENDA_OCUPA_SLOT_SET.has(String(status));
}

/**
 * Agendamentos do mesmo profissional que se sobrepõem ao intervalo (qualquer status).
 * Dois intervalos [i1,f1) e [i2,f2) se sobrepõem se i1 < f2 e f1 > i2 (comparando instantes).
 */
export async function listarSobreposicaoAgendaProfissional(
  supabase: SupabaseClient,
  args: {
    idEmpresa: number;
    idUsuario: number;
    inicioIso: string;
    fimIso: string;
    ignorarAgendamentoId?: number;
  },
): Promise<LinhaSobreposicaoAgenda[]> {
  let q = supabase
    .from("agendamentos")
    .select("id, status, data_hora_inicio, data_hora_fim")
    .eq("id_empresa", args.idEmpresa)
    .eq("id_usuario", args.idUsuario)
    .gt("data_hora_fim", args.inicioIso)
    .lt("data_hora_inicio", args.fimIso)
    .limit(80);

  if (args.ignorarAgendamentoId != null) {
    q = q.neq("id", args.ignorarAgendamentoId);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    status: String(r.status),
    data_hora_inicio: String(r.data_hora_inicio),
    data_hora_fim: String(r.data_hora_fim),
  }));
}

export function haConflitoNasLinhasSobreposicao(linhas: LinhaSobreposicaoAgenda[]): boolean {
  return linhas.some((r) => statusAgendaOcupacaoSlot(r.status));
}

/** Mensagem de conflito + quais registros ainda ocupam o slot (cancelado/faltou não entram). */
export function mensagemConflitoAgendaProfissionalComDetalhe(
  linhas: LinhaSobreposicaoAgenda[],
): string {
  const bloqueantes = linhas.filter((r) => statusAgendaOcupacaoSlot(r.status));
  if (bloqueantes.length === 0) return MSG_CONFLITO_PROFISSIONAL;
  const detalhe = bloqueantes
    .slice(0, 5)
    .map((r) => `nº ${r.id} (${r.status})`)
    .join(", ");
  const mais =
    bloqueantes.length > 5 ? ` (+${bloqueantes.length - 5} outros)` : "";
  return `${MSG_CONFLITO_PROFISSIONAL} Quem ocupa o horário: ${detalhe}${mais}.`;
}

/**
 * Conflito quando existe outro agendamento do mesmo profissional sobrepondo o intervalo
 * com status que ainda ocupa o horário (ex.: não conta cancelado nem faltou).
 */
export async function haConflitoAgendaProfissional(
  supabase: SupabaseClient,
  args: {
    idEmpresa: number;
    idUsuario: number;
    inicioIso: string;
    fimIso: string;
    ignorarAgendamentoId?: number;
  },
): Promise<boolean> {
  const linhas = await listarSobreposicaoAgendaProfissional(supabase, args);
  return haConflitoNasLinhasSobreposicao(linhas);
}

export function inicioEhRetroativo(inicio: Date): boolean {
  return inicio.getTime() < Date.now();
}
