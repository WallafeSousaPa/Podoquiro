import type { SupabaseClient } from "@supabase/supabase-js";

export type OrigemMovimentacaoEstoque =
  | "cadastro"
  | "ajuste_manual"
  | "venda_atendimento"
  | "estorno_atendimento";

export type TipoMovimentacaoEstoque = "entrada" | "saida";

export const ROTULO_ORIGEM_MOVIMENTACAO_ESTOQUE: Record<OrigemMovimentacaoEstoque, string> = {
  cadastro: "Cadastro inicial",
  ajuste_manual: "Ajuste manual",
  venda_atendimento: "Saída — atendimento",
  estorno_atendimento: "Estorno — atendimento",
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

export type MovimentacaoEstoqueContext = {
  id_agendamento?: number | null;
  id_usuario?: number | null;
};
