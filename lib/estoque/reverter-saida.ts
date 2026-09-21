import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarMovimentacaoEstoque } from "@/lib/estoque/registrar-movimentacao-estoque";

type ItemReversao = {
  id: string;
  id_produto: string | null;
  id_produto_destino?: string | null;
  produto: string;
  qtd: number;
};

export async function reverterSaidaEstoque(
  supabase: SupabaseClient,
  params: {
    id_empresa: number;
    id_saida: string;
    itens: ItemReversao[];
    id_usuario: number | null;
    observacao?: string | null;
    statusAtual?: string | null;
    tipo?: string | null;
    id_empresa_destino?: number | null;
  },
): Promise<void> {
  const observacao = params.observacao?.trim() || "Estorno de saída de estoque";
  const statusAtual = params.statusAtual ?? "confirmada";

  if (
    params.tipo === "transferencia" &&
    statusAtual === "confirmada" &&
    params.id_empresa_destino
  ) {
    for (const item of params.itens) {
      const qtd = Math.round(Number(item.qtd));
      const idDest = item.id_produto_destino;
      if (!idDest || qtd <= 0) continue;

      const { data: atual, error: e1 } = await supabase
        .from("produtos")
        .select("id, qtd_estoque, servico")
        .eq("id", idDest)
        .eq("id_empresa", params.id_empresa_destino)
        .maybeSingle();
      if (e1) throw new Error(e1.message);
      if (!atual || atual.servico) continue;

      const saldoAnterior = Number(atual.qtd_estoque);
      const saldoPosterior = Math.round(saldoAnterior - qtd);

      const { error: e2 } = await supabase
        .from("produtos")
        .update({ qtd_estoque: saldoPosterior })
        .eq("id", idDest)
        .eq("id_empresa", params.id_empresa_destino);
      if (e2) throw new Error(e2.message);

      await registrarMovimentacaoEstoque(supabase, {
        id_empresa: params.id_empresa_destino,
        id_produto: idDest,
        tipo: "saida",
        quantidade: qtd,
        saldo_anterior: saldoAnterior,
        saldo_posterior: saldoPosterior,
        origem: "estorno_entrada_transferencia",
        id_usuario: params.id_usuario,
        observacao,
      });
    }
  }

  for (const item of params.itens) {
    const qtd = Math.round(Number(item.qtd));
    if (!item.id_produto || qtd <= 0) continue;

    const { data: atual, error: e1 } = await supabase
      .from("produtos")
      .select("id, qtd_estoque, servico")
      .eq("id", item.id_produto)
      .eq("id_empresa", params.id_empresa)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!atual || atual.servico) continue;

    const saldoAnterior = Number(atual.qtd_estoque);
    const saldoPosterior = Math.round(saldoAnterior + qtd);

    const { error: e2 } = await supabase
      .from("produtos")
      .update({ qtd_estoque: saldoPosterior })
      .eq("id", item.id_produto)
      .eq("id_empresa", params.id_empresa);
    if (e2) throw new Error(e2.message);

    await registrarMovimentacaoEstoque(supabase, {
      id_empresa: params.id_empresa,
      id_produto: item.id_produto,
      tipo: "entrada",
      quantidade: qtd,
      saldo_anterior: saldoAnterior,
      saldo_posterior: saldoPosterior,
      origem: "estorno_saida",
      id_usuario: params.id_usuario,
      observacao,
    });
  }

  const { error: stErr } = await supabase
    .from("estoque_saidas")
    .update({
      status: "cancelada",
      cancelada_em: new Date().toISOString(),
      id_usuario_cancelamento: params.id_usuario,
    })
    .eq("id", params.id_saida)
    .eq("id_empresa", params.id_empresa)
    .in("status", ["confirmada", "em_transito"]);

  if (stErr) throw new Error(stErr.message);
}
