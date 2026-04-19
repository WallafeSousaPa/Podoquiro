/** Segunda-feira como início da semana (comum em agendas corporativas). */

export type VisualizacaoAgenda = "dia" | "semana" | "mes";

export function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function toYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** Segunda-feira da semana que contém `ref`. */
export function segundaDaSemana(ref: Date): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Domingo da mesma semana (fim inclusivo para APIs). */
export function domingoDaSemana(segunda: Date): Date {
  const d = new Date(segunda);
  d.setDate(d.getDate() + 6);
  return d;
}

export function limitesSemanaInclusive(dataRefYmd: string): { inicio: string; fim: string } {
  const ref = parseYmd(dataRefYmd);
  if (!ref) return { inicio: dataRefYmd, fim: dataRefYmd };
  const seg = segundaDaSemana(ref);
  const dom = domingoDaSemana(seg);
  return { inicio: toYmdLocal(seg), fim: toYmdLocal(dom) };
}

export function limitesMesInclusive(dataRefYmd: string): { inicio: string; fim: string } {
  const ref = parseYmd(dataRefYmd);
  if (!ref) return { inicio: dataRefYmd, fim: dataRefYmd };
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const primeiro = new Date(y, m, 1);
  const ultimo = new Date(y, m + 1, 0);
  return { inicio: toYmdLocal(primeiro), fim: toYmdLocal(ultimo) };
}

export function rotuloSemanaPt(inicioYmd: string, fimYmd: string): string {
  const a = parseYmd(inicioYmd);
  const b = parseYmd(fimYmd);
  if (!a || !b) return "";
  const op: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const mesAno: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" };
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${b.getDate()} de ${a.toLocaleDateString("pt-BR", mesAno)}`;
  }
  return `${a.toLocaleDateString("pt-BR", op)} – ${b.toLocaleDateString("pt-BR", { ...op, year: "numeric" })}`;
}

export function rotuloMesPt(dataRefYmd: string): string {
  const d = parseYmd(dataRefYmd);
  if (!d) return "";
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/** Dias da semana (seg–dom) como YYYY-MM-DD. */
export function diasSemanaSegundaADomingo(inicioSemanaYmd: string): string[] {
  const seg = parseYmd(inicioSemanaYmd);
  if (!seg) return [];
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(seg);
    x.setDate(seg.getDate() + i);
    out.push(toYmdLocal(x));
  }
  return out;
}

const DIAS_SEMANA_CORTO = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function nomeDiaSemanaCurto(index0: number): string {
  return DIAS_SEMANA_CORTO[index0] ?? "";
}

/** Grade do mês (segunda = coluna 0); células fora do mês com `null`. */
export function gradeMesSegundaInicio(ano: number, mes1a12: number): ({ ymd: string; dia: number } | null)[][] {
  const first = new Date(ano, mes1a12 - 1, 1);
  const lastDate = new Date(ano, mes1a12, 0).getDate();
  const padMon = (first.getDay() + 6) % 7;
  const cells: ({ ymd: string; dia: number } | null)[] = [];
  for (let i = 0; i < padMon; i++) cells.push(null);
  for (let d = 1; d <= lastDate; d++) {
    const dt = new Date(ano, mes1a12 - 1, d);
    cells.push({ ymd: toYmdLocal(dt), dia: d });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: ({ ymd: string; dia: number } | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}
