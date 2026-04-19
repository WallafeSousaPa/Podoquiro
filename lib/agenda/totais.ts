/** desconto em % (0–100). */
export function calcularValorTotal(valorBruto: number, descontoPct: number): number {
  const d = Number.isFinite(descontoPct) ? Math.min(100, Math.max(0, descontoPct)) : 0;
  const vb = Number.isFinite(valorBruto) && valorBruto >= 0 ? valorBruto : 0;
  return Math.round(vb * (1 - d / 100) * 100) / 100;
}
