import type { SupabaseClient } from "@supabase/supabase-js";
import {
  grupoNomeContemRecepcao,
  grupoNomePermiteProdutosModalCaixaRecepcao,
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

/**
 * Menu Nota Fiscal (Emissão / Consultar): apenas **Administrador** ou **Administrativo**.
 */
export function grupoUsuariosMenuNotaFiscal(
  nomeGrupo: string | null | undefined,
): boolean {
  return grupoUsuariosRelatorioCaixa(nomeGrupo);
}

/**
 * Emissão/cancelamento de NFS-e pelo Caixa: Administrador, Administrativo ou Recepção.
 */
export function grupoUsuariosNfseNoCaixa(
  nomeGrupo: string | null | undefined,
): boolean {
  return (
    grupoUsuariosMenuNotaFiscal(nomeGrupo) ||
    grupoNomePermiteProdutosModalCaixaRecepcao(nomeGrupo)
  );
}

/** Resolve se o usuário pode emitir/cancelar NFS-e na tela de Caixa. */
export async function getUsuarioPodeNfseNoCaixa(
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
  return grupoUsuariosNfseNoCaixa(g?.grupo_usuarios);
}

/** Resolve se o usuário pode acessar o menu e telas de Nota Fiscal (API e página). */
export async function getUsuarioPodeMenuNotaFiscal(
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
  return grupoUsuariosMenuNotaFiscal(g?.grupo_usuarios);
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

/**
 * Menu recepção/balcão (sem Nota Fiscal no menu): Recepção, Receção, Secretaria etc.,
 * exceto perfis com menu Nota Fiscal (Administrador / Administrativo).
 */
export function grupoUsuariosMenuRestritoBalcao(
  nomeGrupo: string | null | undefined,
): boolean {
  if (grupoUsuariosMenuNotaFiscal(nomeGrupo)) return false;
  return grupoNomePermiteProdutosModalCaixaRecepcao(nomeGrupo);
}
