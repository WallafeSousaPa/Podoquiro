/** Rótulo exibido no caixa a partir do billingType da cobrança Asaas. */
export function labelFormaPagamentoFromAsaasBillingType(
  billingType: string | null | undefined,
): string | null {
  const bt = (billingType ?? "").trim().toUpperCase();
  if (!bt) return null;
  if (bt === "PIX") return "PIX";
  if (bt === "CREDIT_CARD") return "Cartão de Crédito";
  if (bt === "DEBIT_CARD") return "Cartão de Débito";
  if (bt === "BOLETO") return "Boleto";
  if (bt === "RECEIVED_IN_CASH" || bt === "CASH") return "Dinheiro";
  return null;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

const STATUS_PAGO_ASAAS = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

/** Extrai billingType de webhook, sync ou resposta bruta da API Asaas. */
export function extrairBillingTypeAsaasResposta(asaasResposta: unknown): string | null {
  if (!asaasResposta || typeof asaasResposta !== "object") return null;
  const raiz = asaasResposta as Record<string, unknown>;

  const payment =
    raiz.payment && typeof raiz.payment === "object"
      ? (raiz.payment as Record<string, unknown>)
      : null;
  if (payment) {
    const bt = pickString(payment, "billingType", "billing_type");
    if (bt) return bt.toUpperCase();
  }

  const dataRaw = Array.isArray(raiz.data) ? (raiz.data as Record<string, unknown>[]) : [];
  const pago = dataRaw.find((p) =>
    STATUS_PAGO_ASAAS.has((pickString(p, "status") ?? "").toUpperCase()),
  );
  const escolhida = pago ?? dataRaw[0] ?? null;
  if (escolhida) {
    const bt = pickString(escolhida, "billingType", "billing_type");
    if (bt) return bt.toUpperCase();
  }

  const btRaiz = pickString(raiz, "billingType", "billing_type");
  return btRaiz ? btRaiz.toUpperCase() : null;
}

export function labelFormaPagamentoTaxaAsaas(asaasResposta: unknown): string | null {
  const bt = extrairBillingTypeAsaasResposta(asaasResposta);
  return labelFormaPagamentoFromAsaasBillingType(bt);
}
