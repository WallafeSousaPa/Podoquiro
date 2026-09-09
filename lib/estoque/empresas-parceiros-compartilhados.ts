import type { SupabaseClient } from "@supabase/supabase-js";

/** Par de empresas que compartilham cadastro de compradores e fornecedores. */
const NOMES_PAR_PODOQUIRO = new Set(["PODOQUIRO", "PODOQUIRO MERCADORIAS"]);

export function normalizarNomeFantasiaEmpresa(nome: string | null | undefined): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Podoquiro e Podoquiro Mercadorias — única exceção ao cadastro isolado por empresa. */
export function empresaCompartilhaParceirosPodoquiro(
  nomeFantasia: string | null | undefined,
): boolean {
  return NOMES_PAR_PODOQUIRO.has(normalizarNomeFantasiaEmpresa(nomeFantasia));
}

/**
 * IDs de empresa cujo cadastro de parceiros deve aparecer junto com `idEmpresa`.
 * Fora do par Podoquiro / Podoquiro Mercadorias, retorna só a própria empresa.
 */
export async function idsEmpresasParceirosVisiveis(
  supabase: SupabaseClient,
  idEmpresa: number,
): Promise<number[]> {
  const { data: atual, error } = await supabase
    .from("empresas")
    .select("id, nome_fantasia")
    .eq("id", idEmpresa)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!atual || !empresaCompartilhaParceirosPodoquiro(atual.nome_fantasia as string | null)) {
    return [idEmpresa];
  }

  const { data: todas, error: listErr } = await supabase
    .from("empresas")
    .select("id, nome_fantasia");
  if (listErr) throw new Error(listErr.message);

  const ids = (todas ?? [])
    .filter((e) => empresaCompartilhaParceirosPodoquiro(e.nome_fantasia as string | null))
    .map((e) => Number(e.id))
    .filter((id) => Number.isFinite(id) && id > 0);

  return ids.length > 0 ? [...new Set(ids)] : [idEmpresa];
}
