import { totalAReceberCaixaComTaxa } from "./taxa-agendamento-caixa";

export type AgendamentoQuitadoOpts = {
  valor_total?: number;
  taxa_agendamento_paga?: number;
};

/**
 * Agendamento quitado no caixa: pagamentos todos **pago** e soma compatível,
 * ou taxa de agendamento online já cobre o valor restante (nada a receber).
 */
export function agendamentoPagamentoQuitado(
  pagamentos: { status_pagamento: string }[],
  opts?: AgendamentoQuitadoOpts,
): boolean {
  const valorTotal = opts?.valor_total ?? 0;
  const taxaPaga = opts?.taxa_agendamento_paga ?? 0;
  if (taxaPaga > 0) {
    const aReceber = totalAReceberCaixaComTaxa(valorTotal, taxaPaga);
    if (aReceber <= 0.02) {
      return (
        pagamentos.length === 0 ||
        pagamentos.every((p) => p.status_pagamento === "pago")
      );
    }
  }

  return (
    pagamentos.length > 0 &&
    pagamentos.every((p) => p.status_pagamento === "pago")
  );
}
