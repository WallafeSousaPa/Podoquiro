/** Data civil (YYYY-MM-DD) do instante em America/Sao_Paulo — alinhado ao `data_referencia` do caixa. */
export function dataReferenciaBrasilia(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
