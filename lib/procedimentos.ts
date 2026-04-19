/** Mesma fórmula da coluna gerada `valor_total` em `procedimentos`. */
export function calcularValorTotalProcedimento(
  custoBase: number,
  margemLucroPct: number,
  taxasImpostosPct: number,
): number {
  const v =
    custoBase * (1 + margemLucroPct / 100) * (1 + taxasImpostosPct / 100);
  return Math.round(v * 100) / 100;
}
