/** Cor padrão para cards de agendamento com procedimento "Corte técnico". */
export const COR_CORTE_TECNICO_AGENDA_PADRAO = "#7105ab";

/** Status em que o card usa `empresas.agenda_cor_corte_tecnico` (ex.: retorno/curativo agendado). */
export const STATUS_AGENDAMENTO_CURATIVO_AGENDADO = "curativo_agendado";

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

/** Status em que a cor de "Curativo agendado" não vale, mesmo com a marca permanente. */
const STATUS_DESCARTA_COR_CURATIVO = new Set(["cancelado", "faltou"]);

/**
 * Fundo do card = cor em `empresas.agenda_cor_corte_tecnico`.
 * Aplica-se quando o agendamento está como "Curativo agendado" OU já passou por esse
 * status (marca `foi_curativo_agendado`), de modo que a cor permanece mesmo após troca
 * de status — exceto quando o status atual for cancelado/faltou.
 * Procedimento "Corte técnico" não usa essa cor (mantém a cor do profissional).
 */
export function agendamentoCardCorEmpresaCorteTecnico(ag: {
  status: string;
  foi_curativo_agendado?: boolean | null;
  procedimentos?: { procedimento?: string | null }[] | null;
}): boolean {
  if (STATUS_DESCARTA_COR_CURATIVO.has(ag.status)) return false;
  return (
    ag.status === STATUS_AGENDAMENTO_CURATIVO_AGENDADO ||
    ag.foi_curativo_agendado === true
  );
}
