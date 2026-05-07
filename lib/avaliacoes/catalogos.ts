export const CATALOGO_AVALIACOES = {
  condicoes_saude: { table: "condicoes_saude", textColumn: "condicao" },
  tipos_unhas: { table: "tipos_unhas", textColumn: "tipo" },
  tipo_pe: { table: "tipo_pe", textColumn: "tipo" },
  hidroses: { table: "hidroses", textColumn: "tipo" },
  lesoes_mecanicas: { table: "lesoes_mecanicas", textColumn: "tipo" },
  formato_dedos: { table: "formato_dedos", textColumn: "tipo" },
  formato_pe: { table: "formato_pe", textColumn: "tipo" },
} as const;

export type CatalogoAvaliacaoChave = keyof typeof CATALOGO_AVALIACOES;

export function parseBooleanQueryParam(value: string | null): boolean {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true";
}

export function sanitizeTextoCatalogo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}
