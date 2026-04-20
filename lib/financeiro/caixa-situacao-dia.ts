import type { SupabaseClient } from "@supabase/supabase-js";

export type SituacaoCaixaDia = {
  tem_abertura: boolean;
  tem_fechamento: boolean;
  nome_responsavel_fechamento: string | null;
};

/**
 * Situação de abertura/fechamento do caixa para empresa + dia de referência.
 */
export async function obterSituacaoCaixaDia(
  supabase: SupabaseClient,
  idEmpresa: number,
  dataReferencia: string,
): Promise<SituacaoCaixaDia> {
  const { data: lancs, error } = await supabase
    .from("caixa_lancamentos")
    .select("tipo, id_responsavel")
    .eq("id_empresa", idEmpresa)
    .eq("data_referencia", dataReferencia);

  if (error) throw new Error(error.message);

  const rows = lancs ?? [];
  const tem_abertura = rows.some((r) => r.tipo === "abertura");
  const fechamento = rows.find((r) => r.tipo === "fechamento");
  const tem_fechamento = Boolean(fechamento);

  let nome_responsavel_fechamento: string | null = null;
  if (fechamento?.id_responsavel) {
    const { data: u } = await supabase
      .from("usuarios")
      .select("nome_completo, usuario")
      .eq("id", fechamento.id_responsavel as number)
      .maybeSingle();
    if (u) {
      nome_responsavel_fechamento =
        (u.nome_completo != null && String(u.nome_completo).trim()) ||
        String(u.usuario) ||
        null;
    }
  }

  return { tem_abertura, tem_fechamento, nome_responsavel_fechamento };
}
