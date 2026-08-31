export function parseEmpresaIdValor(raw: unknown): number | null {
  if (raw === null || typeof raw === "undefined" || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export function empresaIdDaSessao(idEmpresa: string): number | null {
  return parseEmpresaIdValor(idEmpresa);
}
