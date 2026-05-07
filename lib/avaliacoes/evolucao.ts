export const FORMAS_CONTATO_PACIENTE = [
  "Instagram",
  "Google",
  "Tik Tok",
  "Facebook",
  "Indicação",
] as const;

export type FormaContatoPaciente = (typeof FORMAS_CONTATO_PACIENTE)[number];

export const CAMPOS_FOTO_EVOLUCAO = [
  "foto_plantar_direito",
  "foto_plantar_esquerdo",
  "foto_dorso_direito",
  "foto_dorso_esquerdo",
  "foto_doc_termo_consentimento",
] as const;

export type CampoFotoEvolucao = (typeof CAMPOS_FOTO_EVOLUCAO)[number];

export function isFormaContatoPaciente(value: string | null): value is FormaContatoPaciente {
  return value !== null && FORMAS_CONTATO_PACIENTE.includes(value as FormaContatoPaciente);
}

export function optText(value: unknown): string | null {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}
