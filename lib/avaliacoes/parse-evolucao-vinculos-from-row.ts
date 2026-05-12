/** Helpers para ler vínculos N:N de `pacientes_evolucao` retornados pelo Supabase. */

export function parseEvolucaoCondicaoIds(row: Record<string, unknown>): number[] {
  return parseFkColumn(row, "pacientes_evolucao_condicoes", "id_condicao");
}

export function parseEvolucaoTipoUnhaIds(row: Record<string, unknown>): number[] {
  return parseFkColumn(row, "pacientes_evolucao_tipos_unha", "id_tipo_unha");
}

export function parseEvolucaoHidroseIds(row: Record<string, unknown>): number[] {
  return parseFkColumn(row, "pacientes_evolucao_hidroses", "id_hidrose");
}

function parseFkColumn(row: Record<string, unknown>, listKey: string, fkKey: string): number[] {
  const raw = row[listKey];
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = Number((item as Record<string, unknown>)[fkKey]);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function nomeCatalogoEmbutido(
  item: Record<string, unknown>,
  catalogKey: string,
  textKey: string,
): string | null {
  const cat = item[catalogKey];
  const c0 = Array.isArray(cat) ? cat[0] : cat;
  if (!c0 || typeof c0 !== "object") return null;
  const t = (c0 as Record<string, unknown>)[textKey];
  return typeof t === "string" && t.trim() ? t.trim() : null;
}

export function resumoTextosCondicoes(row: Record<string, unknown>): string {
  return joinLabels(row, "pacientes_evolucao_condicoes", "condicoes_saude", "condicao");
}

export function resumoTextosTiposUnha(row: Record<string, unknown>): string {
  return joinLabels(row, "pacientes_evolucao_tipos_unha", "tipos_unhas", "tipo");
}

export function resumoTextosHidroses(row: Record<string, unknown>): string {
  return joinLabels(row, "pacientes_evolucao_hidroses", "hidroses", "tipo");
}

function joinLabels(
  row: Record<string, unknown>,
  listKey: string,
  catalogKey: string,
  textKey: string,
): string {
  const raw = row[listKey];
  if (!Array.isArray(raw) || raw.length === 0) return "-";
  const parts: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const n = nomeCatalogoEmbutido(item as Record<string, unknown>, catalogKey, textKey);
    if (n) parts.push(n);
  }
  return parts.length ? parts.join(", ") : "-";
}
