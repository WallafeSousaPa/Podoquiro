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
    .select("tipo, id_responsavel, numero_caixa, data_lancamento")
    .eq("id_empresa", idEmpresa)
    .eq("data_referencia", dataReferencia);

  if (error) throw new Error(error.message);

  const rows = lancs ?? [];
  const aberturas = new Set<string>();
  const fechamentos = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const numero = String(r.numero_caixa ?? "").trim();
    if (!numero) continue;
    if (r.tipo === "abertura") aberturas.add(numero);
    if (r.tipo === "fechamento") fechamentos.set(numero, r);
  }

  const tem_abertura = [...aberturas].some((n) => !fechamentos.has(n));
  const fechamentoMaisRecente = [...fechamentos.values()].sort((a, b) =>
    String(b.data_lancamento).localeCompare(String(a.data_lancamento)),
  )[0];
  const tem_fechamento = !tem_abertura && Boolean(fechamentoMaisRecente);

  let nome_responsavel_fechamento: string | null = null;
  if (tem_fechamento && fechamentoMaisRecente?.id_responsavel) {
    const { data: u } = await supabase
      .from("usuarios")
      .select("nome_completo, usuario")
      .eq("id", fechamentoMaisRecente.id_responsavel as number)
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
