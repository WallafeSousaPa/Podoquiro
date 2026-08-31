import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarMovimentacaoEstoque } from "@/lib/estoque/registrar-movimentacao-estoque";
import { qtdInteiraEstoque } from "@/lib/estoque/vincular-produtos-nfe";

export type ItemReversaoNfe = {
  id_produto: string | null;
  qtd_entrada: number | null;
  q_com: number;
};

export type ResultadoReversaoNfe = {
  revertidos: number;
  unidades: number;
};

export async function reverterEntradaNfeImportacao(
  supabase: SupabaseClient,
  params: {
    id_empresa: number;
    numero_nf: number;
    chave_acesso: string;
    id_usuario: number | null;
    itens: ItemReversaoNfe[];
  },
): Promise<ResultadoReversaoNfe> {
  const porProduto = new Map<string, number>();
  for (const item of params.itens) {
    const idProduto = item.id_produto?.trim();
    if (!idProduto) continue;
    const qtd =
      item.qtd_entrada != null && Number.isFinite(Number(item.qtd_entrada))
        ? Math.round(Number(item.qtd_entrada))
        : qtdInteiraEstoque(Number(item.q_com));
    if (qtd <= 0) continue;
    porProduto.set(idProduto, (porProduto.get(idProduto) ?? 0) + qtd);
  }

  const observacao = `Estorno NF-e ${params.numero_nf} — chave ${params.chave_acesso}`;
  let revertidos = 0;
  let unidades = 0;

  for (const [idProduto, qtd] of porProduto) {
    const { data: atual, error: e1 } = await supabase
      .from("produtos")
      .select("id, servico, qtd_estoque")
      .eq("id", idProduto)
      .eq("id_empresa", params.id_empresa)
      .maybeSingle();

    if (e1) throw new Error(e1.message);
    if (!atual || atual.servico) continue;

    const saldoAnterior = Number(atual.qtd_estoque);
    const saldoPosterior = Math.round(saldoAnterior - qtd);

    const { error: e2 } = await supabase
      .from("produtos")
      .update({ qtd_estoque: saldoPosterior })
      .eq("id", idProduto)
      .eq("id_empresa", params.id_empresa);

    if (e2) throw new Error(e2.message);

    await registrarMovimentacaoEstoque(supabase, {
      id_empresa: params.id_empresa,
      id_produto: idProduto,
      tipo: "saida",
      quantidade: qtd,
      saldo_anterior: saldoAnterior,
      saldo_posterior: saldoPosterior,
      origem: "estorno_importacao_nfe",
      id_usuario: params.id_usuario,
      observacao,
    });

    revertidos += 1;
    unidades += qtd;
  }

  return { revertidos, unidades };
}
