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

/** Menu restrito: Início, Pacientes › Cadastrar, Financeiro › Caixa (ex.: grupo Recepção). */
export function grupoUsuariosMenuRecepcao(
  nomeGrupo: string | null | undefined,
): boolean {
  return grupoNomeContemRecepcao(nomeGrupo);
}
