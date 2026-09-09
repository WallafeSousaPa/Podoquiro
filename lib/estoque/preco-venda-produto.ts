export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Venda = custo + percentual sobre o custo. */
export function precoVendaPorPercentual(custo: number, percentual: number): number {
  return roundMoney(custo * (1 + percentual / 100));
}

export function parseNumeroNaoNegativo(raw: unknown): number | null {
  if (raw === null || typeof raw === "undefined" || raw === "") return null;
  const n =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function textoHistoricoPrecoVenda(params: {
  anterior: number | null;
  posterior: number | null;
  percentual: number | null;
  lote?: boolean;
}): string {
  const ant =
    params.anterior != null && Number.isFinite(params.anterior) && params.anterior > 0
      ? formatBRL(params.anterior)
      : "sem valor";
  const post =
    params.posterior != null && Number.isFinite(params.posterior) && params.posterior > 0
      ? formatBRL(params.posterior)
      : "sem valor";
  const modo =
    params.percentual != null
      ? ` (${params.percentual}% sobre o custo)`
      : " (valor informado)";
  const prefixo = params.lote ? "Venda em lote" : "Venda";
  return `${prefixo}: ${ant} → ${post}${modo}`.slice(0, 500);
}
