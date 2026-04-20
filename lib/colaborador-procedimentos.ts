import type { SupabaseClient } from "@supabase/supabase-js";

/** IDs de procedimentos liberados para o colaborador na empresa (tabela de vínculos). */
export async function idsProcedimentosLiberadosColaborador(
  supabase: SupabaseClient,
  idUsuario: number,
  idEmpresa: number,
): Promise<Set<number>> {
  const { data: links, error: e1 } = await supabase
    .from("colaboradores_procedimentos")
    .select("id_procedimento")
    .eq("id_usuario", idUsuario);
  if (e1) throw new Error(e1.message);
  const rawIds = (links ?? []).map((r) => r.id_procedimento as number);
  if (rawIds.length === 0) return new Set();
  const { data: procs, error: e2 } = await supabase
    .from("procedimentos")
    .select("id")
    .eq("id_empresa", idEmpresa)
    .in("id", rawIds);
  if (e2) throw new Error(e2.message);
  return new Set((procs ?? []).map((p) => p.id as number));
}

export async function validarProcedimentosDoColaborador(
  supabase: SupabaseClient,
  idUsuario: number,
  idEmpresa: number,
  idsProcedimentos: number[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (idsProcedimentos.length === 0) {
    return { ok: false, message: "Informe ao menos um procedimento." };
  }
  const permitidos = await idsProcedimentosLiberadosColaborador(
    supabase,
    idUsuario,
    idEmpresa,
  );
  for (const id of idsProcedimentos) {
    if (!permitidos.has(id)) {
      return {
        ok: false,
        message:
          "Um ou mais procedimentos não estão liberados para este profissional. Configure em Usuários → Colaboradores.",
      };
    }
  }
  return { ok: true };
}
