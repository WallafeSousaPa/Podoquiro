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

/** Lê múltiplos valores do FormData (mesma chave repetida), deduplica e filtra IDs positivos. */
export function parsePositiveIdsFromFormData(formData: FormData, key: string): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const entry of formData.getAll(key)) {
    const n = Number(entry);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** String de select Supabase para vínculos N:N da evolução (anamnese). */
export const SELECT_PACIENTES_EVOLUCAO_VINCULOS = `
  pacientes_evolucao_condicoes ( id_condicao, condicoes_saude ( condicao ) ),
  pacientes_evolucao_tipos_unha ( id_tipo_unha, tipos_unhas ( tipo ) ),
  pacientes_evolucao_hidroses ( id_hidrose, hidroses ( tipo ) ),
  pacientes_evolucao_lesoes_mecanicas ( id_lesoes_mecanicas, lesoes_mecanicas ( tipo ) )
`.trim();
