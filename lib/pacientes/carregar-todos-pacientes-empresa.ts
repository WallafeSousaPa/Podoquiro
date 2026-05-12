import type { SupabaseClient } from "@supabase/supabase-js";

/** Colunas usadas na listagem / cadastro de pacientes. */
export const PACIENTES_LIST_SELECT =
  "id, cpf, nome_completo, nome_social, genero, data_nascimento, estado_civil, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, ativo";

export type PacienteListRow = {
  id: number;
  cpf: string | null;
  nome_completo: string | null;
  nome_social: string | null;
  genero: string | null;
  data_nascimento: string | null;
  estado_civil: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
};

/**
 * PostgREST limita o retorno por requisição (ex.: 1000 linhas). Percorre todas as páginas.
 */
export async function carregarTodosPacientesEmpresa(
  supabase: SupabaseClient,
  empresaId: number,
): Promise<{ data: PacienteListRow[]; error: string | null }> {
  const pageSize = 1000;
  const allRows: PacienteListRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("pacientes")
      .select(PACIENTES_LIST_SELECT)
      .eq("id_empresa", empresaId)
      .order("id", { ascending: false })
      .range(from, to);

    if (error) {
      console.error(error);
      return { data: [], error: error.message };
    }
    const chunk = (data ?? []) as PacienteListRow[];
    allRows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  return { data: allRows, error: null };
}
