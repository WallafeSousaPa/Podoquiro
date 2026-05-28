/** Agendamento com pelo menos um pagamento e todos com status **pago** (baixa no caixa). */
export function agendamentoPagamentoQuitado(
  pagamentos: { status_pagamento: string }[],
): boolean {
  return (
    pagamentos.length > 0 &&
    pagamentos.every((p) => p.status_pagamento === "pago")
  );
}
