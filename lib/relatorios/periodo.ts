export const DATA_YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_INTERVALO_DIAS_RELATORIO = 366;

export function parseYmd(s: string): { y: number; m: number; d: number } | null {
  if (!DATA_YMD_RE.test(s)) return null;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m, d };
}

export function diasEntreYmd(inicio: string, fim: string): number {
  const a = parseYmd(inicio);
  const b = parseYmd(fim);
  if (!a || !b) return NaN;
  const ta = Date.UTC(a.y, a.m - 1, a.d);
  const tb = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((tb - ta) / 86400000);
}

export function dayStartIsoBr(dataYmd: string): string {
  return `${dataYmd}T00:00:00.000-03:00`;
}

export function nextDayStartIsoBr(dataYmd: string): string {
  const [y, m, d] = dataYmd.split("-").map(Number);
  const t = new Date(y, m - 1, d + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T00:00:00.000-03:00`;
}

export function validarPeriodoRelatorio(dataInicio: string, dataFim: string): string | null {
  if (!DATA_YMD_RE.test(dataInicio) || !DATA_YMD_RE.test(dataFim)) {
    return "Informe data_inicio e data_fim (YYYY-MM-DD).";
  }
  if (dataInicio > dataFim) {
    return "data_inicio não pode ser maior que data_fim.";
  }
  const span = diasEntreYmd(dataInicio, dataFim);
  if (Number.isNaN(span) || span > MAX_INTERVALO_DIAS_RELATORIO) {
    return `O intervalo máximo é de ${MAX_INTERVALO_DIAS_RELATORIO} dias.`;
  }
  return null;
}
