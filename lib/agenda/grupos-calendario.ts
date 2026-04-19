import type { SupabaseClient } from "@supabase/supabase-js";

export type GruposCalendarioResult = {
  ids: number[];
  /** true se existir ao menos um grupo em empresa_agenda_grupos para a empresa. */
  configuradoNaEmpresa: boolean;
};

/** Grupos configurados na empresa; se vazio, usa grupos cujo nome contém "podolog" (ex.: Podólogo). */
export async function resolveGruposCalendario(
  supabase: SupabaseClient,
  idEmpresa: number,
): Promise<GruposCalendarioResult> {
  const { data: cfg, error: cfgErr } = await supabase
    .from("empresa_agenda_grupos")
    .select("id_grupo_usuarios")
    .eq("id_empresa", idEmpresa);
  if (cfgErr) throw new Error(cfgErr.message);
  if (cfg && cfg.length > 0) {
    return {
      ids: cfg.map((r) => r.id_grupo_usuarios as number),
      configuradoNaEmpresa: true,
    };
  }

  const { data: fallback, error: fbErr } = await supabase
    .from("usuarios_grupos")
    .select("id")
    .eq("ativo", true)
    .ilike("grupo_usuarios", "%podolog%");
  if (fbErr) throw new Error(fbErr.message);
  return {
    ids: (fallback ?? []).map((r) => r.id as number),
    configuradoNaEmpresa: false,
  };
}
