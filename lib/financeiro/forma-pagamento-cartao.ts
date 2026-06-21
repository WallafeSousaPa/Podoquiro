/** Forma de pagamento é cartão crédito ou débito (NFC-e / maquineta / bandeira). */
export function formaPagamentoEhCartao(
  agrupamentoCaixa: string | null | undefined,
  nome?: string | null,
): boolean {
  const ag = agrupamentoCaixa?.trim().toLowerCase();
  if (ag === "cartao_credito" || ag === "cartao_debito") return true;

  const n = (nome ?? "").toLowerCase();
  if (n.includes("crédito") || n.includes("credito")) return true;
  if (n.includes("débito") || n.includes("debito")) return true;
  if (n.includes("cart") || n.includes("cartao") || n.includes("cartão")) return true;
  return false;
}
