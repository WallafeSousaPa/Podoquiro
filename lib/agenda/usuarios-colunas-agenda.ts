import type { SupabaseClient } from "@supabase/supabase-js";

import { getUsuarioAgendaSomentePropriaColuna } from "./permissoes-calendario";

export type UsuarioColunaAgendaRow = {
  id: number;
  usuario: string;
  nome_completo: string | null;
  id_grupo_usuarios: number;
};

/**
 * Usuários ativos da empresa que aparecem como colunas: grupo da agenda OU `exibir_na_agenda`.
 * Se não houver grupos parametrizados, só entram usuários com `exibir_na_agenda`.
 */
export async function carregarUsuariosColunasAgenda(
  supabase: SupabaseClient,
  idEmpresa: number,
  grupoIds: number[],
): Promise<UsuarioColunaAgendaRow[]> {
  let q = supabase
    .from("usuarios")
    .select("id, usuario, nome_completo, id_grupo_usuarios")
    .eq("id_empresa", idEmpresa)
    .eq("ativo", true);

  if (grupoIds.length > 0) {
    q = q.or(
      `id_grupo_usuarios.in.(${grupoIds.join(",")}),exibir_na_agenda.eq.true`,
    );
  } else {
    q = q.eq("exibir_na_agenda", true);
  }

  const { data, error } = await q
    .order("nome_completo", { ascending: true })
    .order("usuario", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((u) => ({
    id: u.id as number,
    usuario: u.usuario as string,
    nome_completo: (u.nome_completo as string | null) ?? null,
    id_grupo_usuarios: u.id_grupo_usuarios as number,
  }));
}

/**
 * Grupo `podoquiro`: mantém apenas a coluna do usuário da sessão na lista enviada ao cliente.
 * Passe `somentePropriaColuna` quando já tiver sido obtido com `getUsuarioAgendaSomentePropriaColuna` para evitar consulta duplicada.
 */
export async function filtrarColunasAgendaSomenteUsuarioPodoquiro(
  supabase: SupabaseClient,
  idEmpresa: number,
  idUsuarioSessao: number,
  usuariosRows: UsuarioColunaAgendaRow[],
  somentePropriaColuna?: boolean,
): Promise<UsuarioColunaAgendaRow[]> {
  const soPropria =
    typeof somentePropriaColuna === "boolean"
      ? somentePropriaColuna
      : await getUsuarioAgendaSomentePropriaColuna(supabase, idUsuarioSessao);
  if (!soPropria) return usuariosRows;

  const self = usuariosRows.find((u) => u.id === idUsuarioSessao);
  if (self) return [self];

  const { data: u, error } = await supabase
    .from("usuarios")
    .select("id, usuario, nome_completo, id_grupo_usuarios")
    .eq("id", idUsuarioSessao)
    .eq("id_empresa", idEmpresa)
    .eq("ativo", true)
    .maybeSingle();
  if (error || !u) return [];

  return [
    {
      id: u.id as number,
      usuario: u.usuario as string,
      nome_completo: (u.nome_completo as string | null) ?? null,
      id_grupo_usuarios: u.id_grupo_usuarios as number,
    },
  ];
}
