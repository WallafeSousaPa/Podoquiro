import type { SupabaseClient } from "@supabase/supabase-js";

export type OrigemMovimentacaoEstoque =
  | "cadastro"
  | "ajuste_manual"
  | "venda_atendimento"
  | "estorno_atendimento"
  | "importacao_nfe"
  | "estorno_importacao_nfe"
  | "saida_venda"
  | "saida_transferencia"
  | "saida_perda"
  | "saida_avulso"
  | "estorno_saida"
  | "preco_venda";

export type TipoMovimentacaoEstoque = "entrada" | "saida" | "preco";

export const ROTULO_ORIGEM_MOVIMENTACAO_ESTOQUE: Record<OrigemMovimentacaoEstoque, string> = {
  cadastro: "Cadastro inicial",
  ajuste_manual: "Ajuste manual",
  venda_atendimento: "Saída — atendimento",
  estorno_atendimento: "Estorno — atendimento",
  importacao_nfe: "Entrada — importação NF-e",
  estorno_importacao_nfe: "Estorno — importação NF-e",
  saida_venda: "Saída — venda",
  saida_transferencia: "Saída — transferência",
  saida_perda: "Saída — perda",
  saida_avulso: "Saída — avulso",
  estorno_saida: "Estorno — saída",
  preco_venda: "Preço de venda",
};

export async function registrarMovimentacaoEstoque(
  supabase: SupabaseClient,
  params: {
    id_empresa: number;
    id_produto: string;
    tipo: TipoMovimentacaoEstoque;
    quantidade: number;
    saldo_anterior: number;
    saldo_posterior: number;
    origem: OrigemMovimentacaoEstoque;
    id_agendamento?: number | null;
    id_usuario?: number | null;
    observacao?: string | null;
  },
): Promise<void> {
  const qtd = Number(params.quantidade);
  if (!Number.isFinite(qtd) || qtd <= 0) return;

  const { error } = await supabase.from("produtos_movimentacao_estoque").insert({
    id_empresa: params.id_empresa,
    id_produto: params.id_produto,
    tipo: params.tipo,
    quantidade: qtd,
    saldo_anterior: Math.round(params.saldo_anterior),
    saldo_posterior: Math.round(params.saldo_posterior),
    origem: params.origem,
    id_agendamento: params.id_agendamento ?? null,
    id_usuario: params.id_usuario ?? null,
    observacao: params.observacao?.trim() || null,
  });

  if (error) {
    console.error("registrarMovimentacaoEstoque:", error);
  }
}

export async function registrarHistoricoPrecoVenda(
  supabase: SupabaseClient,
  params: {
    id_empresa: number;
    id_produto: string;
    saldo: number;
    id_usuario?: number | null;
    observacao: string;
  },
): Promise<void> {
  const { error } = await supabase.from("produtos_movimentacao_estoque").insert({
    id_empresa: params.id_empresa,
    id_produto: params.id_produto,
    tipo: "preco",
    quantidade: 0,
    saldo_anterior: Math.round(params.saldo),
    saldo_posterior: Math.round(params.saldo),
    origem: "preco_venda",
    id_usuario: params.id_usuario ?? null,
    observacao: params.observacao.trim().slice(0, 500),
  });

  if (error) {
    console.error("registrarHistoricoPrecoVenda:", error);
    throw new Error("Não foi possível gravar o histórico de preço de venda.");
  }
}

export type MovimentacaoEstoqueContext = {
  id_agendamento?: number | null;
  id_usuario?: number | null;
};
