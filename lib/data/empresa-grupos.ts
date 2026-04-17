import { createAdminClient } from "@/lib/supabase/admin";

export type EmpresaGrupo = {
  id: number;
  grupo_empresa: string;
  data_atualizacao: string;
  ativo: boolean;
};

export async function listEmpresaGrupos(): Promise<EmpresaGrupo[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("empresa_grupos")
    .select("id, grupo_empresa, data_atualizacao, ativo")
    .order("grupo_empresa", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as EmpresaGrupo[];
}
