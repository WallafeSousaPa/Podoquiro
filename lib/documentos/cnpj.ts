/** Normaliza CNPJ para 14 dígitos ou retorna null se vazio/inválido. */
export function normalizarCnpj14(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length !== 14) return null;
  return d;
}

export function formatarCnpj(cnpj14: string): string {
  const d = cnpj14.replace(/\D/g, "");
  if (d.length !== 14) return cnpj14;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}
