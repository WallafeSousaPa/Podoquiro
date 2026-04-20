import { createAdminClient } from "@/lib/supabase/admin";

export type UsuarioGrupo = {
  id: number;
  grupo_usuarios: string;
  data_atualizacao: string;
  ativo: boolean;
  calendario: boolean;
  /** Na agenda: só a coluna do próprio usuário (e só seus agendamentos). */
  agenda_apenas_coluna_propria: boolean;
};

export async function listUsuariosGrupos(): Promise<UsuarioGrupo[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("usuarios_grupos")
    .select(
      "id, grupo_usuarios, data_atualizacao, ativo, calendario, agenda_apenas_coluna_propria",
    )
    .order("grupo_usuarios", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as UsuarioGrupo[];
}
