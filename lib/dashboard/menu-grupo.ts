import type { SupabaseClient } from "@supabase/supabase-js";
import {
  grupoNomeContemRecepcao,
  normalizarNomeGrupoAgenda,
} from "@/lib/agenda/permissoes-calendario";

/**
 * Grupo restrito ao menu Início (calendário): Podólogo e variações (nome normalizado
 * contém "podolog") ou o legado "podogolo".
 */
export function grupoUsuariosSomenteMenuInicioCalendario(
  nomeGrupo: string | null | undefined,
): boolean {
  if (nomeGrupo == null || String(nomeGrupo).trim() === "") return false;
  const c = normalizarNomeGrupoAgenda(String(nomeGrupo));
  return c === "podogolo" || c.includes("podolog");
}

/** Grupo com permissões administrativas (nome contém "admin"). */
export function grupoUsuariosAdministrador(
  nomeGrupo: string | null | undefined,
): boolean {
  if (nomeGrupo == null || String(nomeGrupo).trim() === "") return false;
  const c = normalizarNomeGrupoAgenda(String(nomeGrupo));
  return c.includes("admin");
}

/**
 * Relatório de caixa (histórico): apenas grupos cujo nome, normalizado, indica
 * **Administrador** ou **Administrativo** (alinhado a outras regras do sistema).
 */
export function grupoUsuariosRelatorioCaixa(
  nomeGrupo: string | null | undefined,
): boolean {
  if (nomeGrupo == null || String(nomeGrupo).trim() === "") return false;
  const c = normalizarNomeGrupoAgenda(String(nomeGrupo));
  return c.includes("administrador") || c.includes("administrativo");
}

/** Resolve se o usuário pode acessar o relatório de caixa (API e página). */
export async function getUsuarioPodeRelatorioCaixa(
  supabase: SupabaseClient,
  idUsuario: number,
): Promise<boolean> {
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) return false;
  const { data: u, error: uErr } = await supabase
    .from("usuarios")
    .select(
      "usuarios_grupos:usuarios_grupos!usuarios_id_grupo_usuarios_fkey ( grupo_usuarios )",
    )
    .eq("id", idUsuario)
    .maybeSingle();
  if (uErr || !u) return false;
  type G = { grupo_usuarios: string | null };
  const gRaw = u.usuarios_grupos as G | G[] | null | undefined;
  const g = Array.isArray(gRaw) ? gRaw[0] : gRaw;
  return grupoUsuariosRelatorioCaixa(g?.grupo_usuarios);
}

/** Menu restrito: Início, Pacientes › Cadastrar, Financeiro › Caixa (ex.: grupo Recepção). */
export function grupoUsuariosMenuRecepcao(
  nomeGrupo: string | null | undefined,
): boolean {
  return grupoNomeContemRecepcao(nomeGrupo);
}
