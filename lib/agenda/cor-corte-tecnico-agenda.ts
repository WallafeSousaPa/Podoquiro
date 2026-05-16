/** Cor padrão para cards de agendamento com procedimento "Corte técnico". */
export const COR_CORTE_TECNICO_AGENDA_PADRAO = "#7105ab";

const NOME_CORTE_TECNICO_NORMALIZADO = "CORTE TECNICO";

function normalizarNomeProcedimentoAgenda(s: string | null | undefined): string {
  if (s == null) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Indica se o agendamento tem só um procedimento e ele é "Corte técnico" (comparação tolerante a acentos). Com mais de um procedimento, a cor especial não vale. */
export function agendamentoTemProcedimentoCorteTecnico(ag: {
  procedimentos?: { procedimento?: string | null }[] | null;
}): boolean {
  const lista = ag.procedimentos;
  if (!Array.isArray(lista) || lista.length !== 1) return false;
  const n = normalizarNomeProcedimentoAgenda(lista[0]?.procedimento ?? null);
  return n === NOME_CORTE_TECNICO_NORMALIZADO;
}

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

/** Valida e retorna #RRGGBB ou null se inválido. */
export function parseHexCorAgenda(input: string | null | undefined): string | null {
  if (input == null) return null;
  const t = String(input).trim();
  if (!t) return null;
  if (!HEX_RE.test(t)) return null;
  return t.toLowerCase();
}

/** Cor efetiva para o card: valor da empresa ou padrão #7105ab. */
export function corCorteTecnicoAgendaResolvida(db: string | null | undefined): string {
  const p = parseHexCorAgenda(db ?? null);
  return p ?? COR_CORTE_TECNICO_AGENDA_PADRAO;
}
