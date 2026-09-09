import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHAVES_MENU_LATERAL,
  isChaveMenuLateral,
} from "@/lib/dashboard/menus-catalogo";

export async function menusDoGrupo(
  supabase: SupabaseClient,
  idGrupo: number,
): Promise<string[]> {
  if (!Number.isFinite(idGrupo) || idGrupo <= 0) return [];
  const { data, error } = await supabase
    .from("menu_permissoes_grupo")
    .select("menu_chave")
    .eq("id_grupo", idGrupo);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r) => String(r.menu_chave))
    .filter(isChaveMenuLateral);
}

export async function menusPersonalizadosDoUsuario(
  supabase: SupabaseClient,
  idUsuario: number,
): Promise<string[] | null> {
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) return null;
  const { data, error } = await supabase
    .from("menu_permissoes_usuario")
    .select("menu_chave")
    .eq("id_usuario", idUsuario);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data.map((r) => String(r.menu_chave)).filter(isChaveMenuLateral);
}

/**
 * Menus efetivos no login: se o usuário tem personalização, usa só ela;
 * senão, herda os menus do tipo (grupo).
 */
export async function menusEfetivosDoUsuario(
  supabase: SupabaseClient,
  idUsuario: number,
): Promise<{ menus: string[]; origem: "usuario" | "grupo"; idGrupo: number | null }> {
  const { data: u, error } = await supabase
    .from("usuarios")
    .select("id_grupo_usuarios")
    .eq("id", idUsuario)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const idGrupo =
    typeof u?.id_grupo_usuarios === "number" ? u.id_grupo_usuarios : Number(u?.id_grupo_usuarios);
  const idGrupoOk = Number.isFinite(idGrupo) && idGrupo > 0 ? idGrupo : null;

  const personalizado = await menusPersonalizadosDoUsuario(supabase, idUsuario);
  if (personalizado) {
    return { menus: personalizado, origem: "usuario", idGrupo: idGrupoOk };
  }
  if (!idGrupoOk) return { menus: [], origem: "grupo", idGrupo: null };
  const doGrupo = await menusDoGrupo(supabase, idGrupoOk);
  return { menus: doGrupo, origem: "grupo", idGrupo: idGrupoOk };
}

export async function substituirMenusGrupo(
  supabase: SupabaseClient,
  idGrupo: number,
  chaves: string[],
): Promise<string[]> {
  const limpas = [...new Set(chaves.filter(isChaveMenuLateral))];
  const { error: delErr } = await supabase
    .from("menu_permissoes_grupo")
    .delete()
    .eq("id_grupo", idGrupo);
  if (delErr) throw new Error(delErr.message);
  if (limpas.length > 0) {
    const { error: insErr } = await supabase.from("menu_permissoes_grupo").insert(
      limpas.map((menu_chave) => ({ id_grupo: idGrupo, menu_chave })),
    );
    if (insErr) throw new Error(insErr.message);
  }
  return limpas;
}

export async function substituirMenusUsuario(
  supabase: SupabaseClient,
  idUsuario: number,
  chaves: string[],
): Promise<string[]> {
  const limpas = [...new Set(chaves.filter(isChaveMenuLateral))];
  const { error: delErr } = await supabase
    .from("menu_permissoes_usuario")
    .delete()
    .eq("id_usuario", idUsuario);
  if (delErr) throw new Error(delErr.message);
  if (limpas.length > 0) {
    const { error: insErr } = await supabase.from("menu_permissoes_usuario").insert(
      limpas.map((menu_chave) => ({ id_usuario: idUsuario, menu_chave })),
    );
    if (insErr) throw new Error(insErr.message);
  }
  return limpas;
}

export async function limparPersonalizacaoUsuario(
  supabase: SupabaseClient,
  idUsuario: number,
): Promise<void> {
  const { error } = await supabase
    .from("menu_permissoes_usuario")
    .delete()
    .eq("id_usuario", idUsuario);
  if (error) throw new Error(error.message);
}

export { CHAVES_MENU_LATERAL };
