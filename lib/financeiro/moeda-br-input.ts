/** Parse digitado em pt-BR (ex.: 1.234,56) para número. */
export function parseMoedaBrCliente(v: string): number {
  const t = v.trim().replace(/\s/g, "");
  if (t === "") return 0;
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  let normalized: string;
  if (lastComma !== -1 && lastComma > lastDot) {
    normalized = t.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = t.replace(/,/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

/** Campo de valor em pt-BR (sem símbolo R$). */
export function fmtMoedaBrCampo(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
