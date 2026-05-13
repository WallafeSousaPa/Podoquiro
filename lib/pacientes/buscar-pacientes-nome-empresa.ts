import type { SupabaseClient } from "@supabase/supabase-js";

/** Escapa `%`, `_` e `\` para uso em padrão ILIKE. */
export function escapePadraoIlike(texto: string): string {
  return texto.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export type PacienteBuscaLinha = {
  id: number;
  nome_completo: string | null;
  nome_social: string | null;
};

function nomeExibicao(r: PacienteBuscaLinha): string {
  const nc = String(r.nome_completo ?? "").trim();
  const ns = String(r.nome_social ?? "").trim();
  if (nc && ns && normalizar(ns) !== normalizar(nc)) return `${nc} (${ns})`;
  return nc || ns || `Paciente #${r.id}`;
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca pacientes da empresa por nome completo ou nome social (substring, ILIKE).
 * Usado na importação e telas que não carregam a lista inteira na memória.
 */
export async function buscarPacientesPorNomeEmpresa(
  supabase: SupabaseClient,
  empresaId: number,
  termo: string,
  limite: number = 80,
): Promise<{ data: { id: number; nome: string }[]; error: string | null }> {
  const t = termo.trim();
  if (t.length < 2) {
    return { data: [], error: null };
  }
  const pattern = `%${escapePadraoIlike(t)}%`;

  const [{ data: porNome, error: e1 }, { data: porSocial, error: e2 }] = await Promise.all([
    supabase
      .from("pacientes")
      .select("id, nome_completo, nome_social")
      .eq("id_empresa", empresaId)
      .ilike("nome_completo", pattern)
      .order("nome_completo", { ascending: true })
      .limit(limite),
    supabase
      .from("pacientes")
      .select("id, nome_completo, nome_social")
      .eq("id_empresa", empresaId)
      .ilike("nome_social", pattern)
      .order("nome_completo", { ascending: true })
      .limit(limite),
  ]);

  if (e1) return { data: [], error: e1.message };
  if (e2) return { data: [], error: e2.message };

  const map = new Map<number, PacienteBuscaLinha>();
  for (const r of [...(porNome ?? []), ...(porSocial ?? [])]) {
    const row = r as PacienteBuscaLinha;
    if (!map.has(row.id)) map.set(row.id, row);
  }
  const data = [...map.values()]
    .sort((a, b) =>
      String(a.nome_completo ?? "").localeCompare(String(b.nome_completo ?? ""), "pt-BR"),
    )
    .slice(0, limite)
    .map((r) => ({ id: r.id, nome: nomeExibicao(r) }));

  return { data, error: null };
}
