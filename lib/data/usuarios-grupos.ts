import { createAdminClient } from "@/lib/supabase/admin";

export type UsuarioGrupo = {
  id: number;
  grupo_usuarios: string;
  data_atualizacao: string;
  ativo: boolean;
};

export async function listUsuariosGrupos(): Promise<UsuarioGrupo[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("usuarios_grupos")
    .select("id, grupo_usuarios, data_atualizacao, ativo")
    .order("grupo_usuarios", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as UsuarioGrupo[];
}
