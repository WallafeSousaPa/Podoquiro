/** JPEG gerado pelo canvas de assinatura (termo e contrato). */
const ASSINATURA_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const TAMANHO_MAX = 180_000;

export function assinaturaImagem(valor: unknown): string {
  if (typeof valor !== "string") return "";
  const t = valor.replace(/\s+/g, "");
  if (!t || t.length > TAMANHO_MAX || !ASSINATURA_RE.test(t)) return "";
  return t;
}
