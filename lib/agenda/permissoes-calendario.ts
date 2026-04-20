import type { SupabaseClient } from "@supabase/supabase-js";

/** Compacta nome do grupo para comparar (remove acentos, espaços e pontuação). */
export function normalizarNomeGrupoAgenda(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Legado: grupo cujo nome normalizado é ou termina em "podoquiro" (ex.: "Podo Quiro", "Podóquiro").
 */
export function grupoNomeLegadoSomentePropriaColunaAgenda(
  nome: string | null | undefined,
): boolean {
  if (nome == null || String(nome).trim() === "") return false;
  const c = normalizarNomeGrupoAgenda(String(nome));
  return c === "podoquiro" || c.endsWith("podoquiro");
}

/** Grupo Recepção: visão completa na agenda e no caixa (todos os agendamentos / colunas). */
export function grupoNomeContemRecepcao(nome: string | null | undefined): boolean {
  if (nome == null || String(nome).trim() === "") return false;
  const c = normalizarNomeGrupoAgenda(String(nome));
  return c.includes("recepcao");
}

type GrupoAgendaEmbed = {
  grupo_usuarios: string | null;
  agenda_apenas_coluna_propria?: boolean | null;
};

/**
 * Na agenda: somente a coluna do usuário logado e somente seus agendamentos, quando:
 * - `usuarios_grupos.agenda_apenas_coluna_propria` é true, ou
 * - nome do grupo casa com o legado "podoquiro" (normalizado).
 */
export async function getUsuarioAgendaSomentePropriaColuna(
  supabase: SupabaseClient,
  idUsuario: number,
): Promise<boolean> {
  const { data: u, error: uErr } = await supabase
    .from("usuarios")
    .select(
      "id_grupo_usuarios, usuarios_grupos:usuarios_grupos!usuarios_id_grupo_usuarios_fkey ( grupo_usuarios, agenda_apenas_coluna_propria )",
    )
    .eq("id", idUsuario)
    .maybeSingle();
  if (uErr || !u?.id_grupo_usuarios) return false;

  const gRaw = u.usuarios_grupos as GrupoAgendaEmbed | GrupoAgendaEmbed[] | null;
  const g = Array.isArray(gRaw) ? gRaw[0] : gRaw;
  if (!g) return false;

  if (grupoNomeContemRecepcao(g.grupo_usuarios)) return false;

  if (g.agenda_apenas_coluna_propria === true) return true;
  return grupoNomeLegadoSomentePropriaColunaAgenda(g.grupo_usuarios);
}

/** Membros do grupo com `calendario` veem todos os agendamentos; caso contrário, só os próprios. */
export async function getPodeVerTodosAgendamentos(
  supabase: SupabaseClient,
  idUsuario: number,
): Promise<boolean> {
  const { data: u, error: uErr } = await supabase
    .from("usuarios")
    .select("id_grupo_usuarios")
    .eq("id", idUsuario)
    .maybeSingle();
  if (uErr || !u?.id_grupo_usuarios) return false;

  const { data: g, error: gErr } = await supabase
    .from("usuarios_grupos")
    .select("calendario, grupo_usuarios")
    .eq("id", u.id_grupo_usuarios as number)
    .maybeSingle();
  if (gErr) return false;
  if (grupoNomeContemRecepcao(g?.grupo_usuarios)) return true;
  return Boolean(g?.calendario);
}

/** Profissional pode ser coluna na agenda: grupo parametrizado ou exceção `exibir_na_agenda`. */
export function profissionalPodeNaAgenda(
  grupoIds: number[],
  idGrupoUsuario: number,
  exibirNaAgenda: boolean,
): boolean {
  if (exibirNaAgenda) return true;
  return grupoIds.length > 0 && grupoIds.includes(idGrupoUsuario);
}
