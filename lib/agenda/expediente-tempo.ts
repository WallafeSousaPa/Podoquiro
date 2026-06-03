/** Utilitários de hora (HH:MM) para expediente do colaborador e cálculo de intervalos vagos. */

const HORA_HHMM_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** Converte "HH:MM" (ou "HH:MM:SS") em minutos desde a meia-noite. Retorna null se inválido. */
export function parseHoraParaMinutos(input: string | null | undefined): number | null {
  if (input == null) return null;
  const t = String(input).trim();
  if (!t) return null;
  const m = HORA_HHMM_RE.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Formata minutos desde a meia-noite em "HH:MM". */
export function formatMinutosParaHora(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Normaliza para "HH:MM" (descarta segundos) ou null. */
export function normalizarHoraHHMM(input: string | null | undefined): string | null {
  const min = parseHoraParaMinutos(input);
  return min == null ? null : formatMinutosParaHora(min);
}

export type ExpedienteHorarios = {
  horario_inicio: string;
  intervalo_inicio: string | null;
  intervalo_fim: string | null;
  horario_fim: string;
  horario_inicio_bloqueado: string | null;
  horario_fim_bloqueado: string | null;
};

/**
 * Valida os horários do expediente. Retorna mensagem de erro ou null se OK.
 * Regras: início < fim; se houver intervalo, início < fim e dentro da janela;
 * idem para o bloqueio.
 */
export function validarExpedienteHorarios(h: ExpedienteHorarios): string | null {
  const ini = parseHoraParaMinutos(h.horario_inicio);
  const fim = parseHoraParaMinutos(h.horario_fim);
  if (ini == null) return "Informe o horário de início (HH:MM).";
  if (fim == null) return "Informe o horário de fim (HH:MM).";
  if (ini >= fim) return "O horário de início deve ser menor que o de fim.";

  const parDefinido = (a: string | null, b: string | null) =>
    (a != null && a !== "") || (b != null && b !== "");

  if (parDefinido(h.intervalo_inicio, h.intervalo_fim)) {
    const ii = parseHoraParaMinutos(h.intervalo_inicio);
    const ifim = parseHoraParaMinutos(h.intervalo_fim);
    if (ii == null || ifim == null) {
      return "Preencha início e fim do intervalo (HH:MM).";
    }
    if (ii >= ifim) return "O início do intervalo deve ser menor que o fim.";
    if (ii < ini || ifim > fim) {
      return "O intervalo deve estar dentro da janela de expediente.";
    }
  }

  if (parDefinido(h.horario_inicio_bloqueado, h.horario_fim_bloqueado)) {
    const bi = parseHoraParaMinutos(h.horario_inicio_bloqueado);
    const bf = parseHoraParaMinutos(h.horario_fim_bloqueado);
    if (bi == null || bf == null) {
      return "Preencha início e fim do horário bloqueado (HH:MM).";
    }
    if (bi >= bf) return "O início do bloqueio deve ser menor que o fim.";
    if (bi < ini || bf > fim) {
      return "O horário bloqueado deve estar dentro da janela de expediente.";
    }
  }

  return null;
}
