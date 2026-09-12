import type { SupabaseClient } from "@supabase/supabase-js";
import {
  grupoNomeContemRecepcao,
  grupoNomePermiteProdutosModalCaixaRecepcao,
  normalizarNomeGrupoAgenda,
} from "@/lib/agenda/permissoes-calendario";
import { usuarioTemMenu, usuarioTemMenuPrefixo } from "@/lib/dashboard/menus-catalogo";
import { menusEfetivosDoUsuario } from "@/lib/dashboard/menus-permissoes";

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
 * Cancelar saída de estoque / NF-e na tela de Saídas: só Administrador ou Diretoria.
 * Não inclui o tipo Administrativo.
 */
export function grupoUsuariosAdministradorOuDiretoria(
  nomeGrupo: string | null | undefined,
): boolean {
  if (nomeGrupo == null || String(nomeGrupo).trim() === "") return false;
  const c = normalizarNomeGrupoAgenda(String(nomeGrupo));
  if (c.includes("administrador") || c === "admin") return true;
  if (c.includes("diretoria") || c === "diretor") return true;
  return false;
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
 * @deprecated Menu Nota Fiscal agora vem do banco (`menu_permissoes_*`).
 * Ainda usado só para ações de NFS-e no Caixa (tipo Administrativo).
 */
export function grupoUsuariosMenuNotaFiscal(
  nomeGrupo: string | null | undefined,
): boolean {
  return grupoUsuariosRelatorioCaixa(nomeGrupo);
}

/** @deprecated Menu Ponto agora vem do banco (`menu_permissoes_*`). */
export function grupoUsuariosMenuPonto(
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

/** Item de menu efetivo (banco: tipo ou personalização do usuário). */
export async function getUsuarioPodeMenuChave(
  supabase: SupabaseClient,
  idUsuario: number,
  chave: string,
): Promise<boolean> {
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) return false;
  try {
    const efetivo = await menusEfetivosDoUsuario(supabase, idUsuario);
    return usuarioTemMenu(efetivo.menus, chave);
  } catch {
    return false;
  }
}

/** Resolve se o usuário pode acessar o menu e telas de Nota Fiscal (API e página). */
export async function getUsuarioPodeMenuNotaFiscal(
  supabase: SupabaseClient,
  idUsuario: number,
): Promise<boolean> {
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) return false;
  try {
    const efetivo = await menusEfetivosDoUsuario(supabase, idUsuario);
    return usuarioTemMenuPrefixo(efetivo.menus, "nota-fiscal");
  } catch {
    return false;
  }
}

/** Relatórios ou Caixa Movimento (derivado dos menus do banco, não do tipo). */
export async function getUsuarioPodeRelatorioCaixa(
  supabase: SupabaseClient,
  idUsuario: number,
): Promise<boolean> {
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) return false;
  try {
    const efetivo = await menusEfetivosDoUsuario(supabase, idUsuario);
    return (
      usuarioTemMenuPrefixo(efetivo.menus, "relatorios") ||
      usuarioTemMenu(efetivo.menus, "financeiro.caixa-movimento")
    );
  } catch {
    return false;
  }
}

/** Resolve se o usuário pode acessar a tela e as APIs de ponto. */
export async function getUsuarioPodeMenuPonto(
  supabase: SupabaseClient,
  idUsuario: number,
): Promise<boolean> {
  return getUsuarioPodeMenuChave(supabase, idUsuario, "ponto");
}

export const MSG_SO_OUTRO_ADMINISTRADOR_TIPO =
  "Somente outro administrador pode definir ou alterar o tipo Administrador / Administrativo.";

/**
 * Impede que quem não é administrador atribua ou altere o tipo admin,
 * e impede que o próprio administrador altere o próprio tipo.
 */
export async function recusarAlteracaoTipoAdministrador(opts: {
  supabase: SupabaseClient;
  idUsuarioSessao: number;
  nomeGrupoNovo?: string | null;
  nomeGrupoAtual?: string | null;
  idUsuarioAlvo?: number | null;
}): Promise<{ error: string } | null> {
  const novoAdmin = grupoUsuariosAdministrador(opts.nomeGrupoNovo);
  const atualAdmin = grupoUsuariosAdministrador(opts.nomeGrupoAtual);
  if (!novoAdmin && !atualAdmin) return null;

  const sessaoAdmin = await getUsuarioGrupoAdministrativo(
    opts.supabase,
    opts.idUsuarioSessao,
  );
  if (!sessaoAdmin) {
    return { error: MSG_SO_OUTRO_ADMINISTRADOR_TIPO };
  }

  const nomeNovo = (opts.nomeGrupoNovo ?? "").trim();
  const nomeAtual = (opts.nomeGrupoAtual ?? "").trim();
  const mudouTipo = nomeNovo !== nomeAtual;

  if (
    mudouTipo &&
    opts.idUsuarioAlvo != null &&
    opts.idUsuarioAlvo === opts.idUsuarioSessao
  ) {
    return { error: MSG_SO_OUTRO_ADMINISTRADOR_TIPO };
  }

  return null;
}

/** Ação administrativa (excluir avaliação, parametrizar anamnese): por tipo, não por menu. */
export async function getUsuarioGrupoAdministrativo(
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

/** Excluir importação de NF-e e reverter estoque: Administrador ou Administrativo. */
export function grupoUsuariosPodeExcluirImportacaoEstoque(
  nomeGrupo: string | null | undefined,
): boolean {
  return grupoUsuariosRelatorioCaixa(nomeGrupo);
}

/** Resolve se o usuário pode excluir importação de NF-e (API). */
export async function getUsuarioPodeExcluirImportacaoEstoque(
  supabase: SupabaseClient,
  idUsuario: number,
): Promise<boolean> {
  return getUsuarioGrupoAdministrativo(supabase, idUsuario);
}

async function nomeGrupoDoUsuario(
  supabase: SupabaseClient,
  idUsuario: number,
): Promise<string | null> {
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) return null;
  const { data: u, error: uErr } = await supabase
    .from("usuarios")
    .select(
      "usuarios_grupos:usuarios_grupos!usuarios_id_grupo_usuarios_fkey ( grupo_usuarios )",
    )
    .eq("id", idUsuario)
    .maybeSingle();
  if (uErr || !u) return null;
  type G = { grupo_usuarios: string | null };
  const gRaw = u.usuarios_grupos as G | G[] | null | undefined;
  const g = Array.isArray(gRaw) ? gRaw[0] : gRaw;
  return g?.grupo_usuarios ?? null;
}

/** Resolve se o usuário pode cancelar saída de estoque (Administrador ou Diretoria). */
export async function getUsuarioPodeCancelarSaidaEstoque(
  supabase: SupabaseClient,
  idUsuario: number,
): Promise<boolean> {
  return grupoUsuariosAdministradorOuDiretoria(await nomeGrupoDoUsuario(supabase, idUsuario));
}

/** @deprecated Menu Recepção agora vem do banco (`menu_permissoes_*`). */
export function grupoUsuariosMenuRecepcao(
  nomeGrupo: string | null | undefined,
): boolean {
  return grupoNomeContemRecepcao(nomeGrupo);
}

/**
 * @deprecated Menu Recepção/balcão agora vem do banco (`menu_permissoes_*`).
 */
export function grupoUsuariosMenuRestritoBalcao(
  nomeGrupo: string | null | undefined,
): boolean {
  if (grupoUsuariosMenuNotaFiscal(nomeGrupo)) return false;
  return grupoNomePermiteProdutosModalCaixaRecepcao(nomeGrupo);
}

/**
 * Personalizar mensagem WhatsApp da taxa de agendamento: Recepção, Administrativo ou Administrador.
 */
export function grupoUsuariosPodePersonalizarMensagemWhatsappTaxa(
  nomeGrupo: string | null | undefined,
): boolean {
  if (grupoUsuariosRelatorioCaixa(nomeGrupo)) return true;
  return grupoNomePermiteProdutosModalCaixaRecepcao(nomeGrupo);
}

/** Resolve se o usuário pode editar a mensagem WhatsApp da taxa de agendamento. */
export async function getUsuarioPodePersonalizarMensagemWhatsappTaxa(
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
  return grupoUsuariosPodePersonalizarMensagemWhatsappTaxa(g?.grupo_usuarios);
}
