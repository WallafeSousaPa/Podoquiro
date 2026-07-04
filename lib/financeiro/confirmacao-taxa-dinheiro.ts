import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarCaixaMovimentoTaxaSePago } from "@/lib/financeiro/caixa-movimento";

/** Forma de pagamento dinheiro (global) para registrar taxa no caixa. */
export async function resolverFormaPagamentoDinheiro(
  supabase: SupabaseClient,
): Promise<{ id: number; nome: string } | null> {
  const { data, error } = await supabase
    .from("formas_pagamento")
    .select("id, nome, agrupamento_caixa")
    .eq("ativo", true);

  if (error) throw new Error(error.message);
  if (!data?.length) return null;

  const porAgrupamento = data.find((f) => f.agrupamento_caixa === "dinheiro");
  if (porAgrupamento) {
    return { id: porAgrupamento.id as number, nome: String(porAgrupamento.nome) };
  }

  const porNome = data.find((f) => {
    const n = String(f.nome ?? "").toLowerCase();
    return (
      n.includes("dinheiro") ||
      n.includes("espécie") ||
      n.includes("especie") ||
      n.includes("numerário") ||
      n.includes("numerario")
    );
  });
  if (porNome) {
    return { id: porNome.id as number, nome: String(porNome.nome) };
  }

  return null;
}

export type ConfirmacaoTaxaDinheiroResult = {
  idTaxa: number;
  valor: number;
  idFormaPagamento: number;
};

/**
 * Registra taxa paga em dinheiro, lança pagamento no agendamento e confirma o horário.
 */
export async function confirmarAgendamentoComTaxaDinheiro(
  supabase: SupabaseClient,
  args: {
    idAgendamento: number;
    idEmpresa: number;
    valor: number;
  },
): Promise<ConfirmacaoTaxaDinheiroResult> {
  const forma = await resolverFormaPagamentoDinheiro(supabase);
  if (!forma) {
    throw new Error(
      'Cadastre uma forma de pagamento "Dinheiro" (ou com agrupamento caixa = dinheiro) em Financeiro → Parametrização → Tipos de pagamento.',
    );
  }

  const valor = Math.round(args.valor * 100) / 100;
  if (!Number.isFinite(valor) || valor < 1) {
    throw new Error("Informe um valor de taxa de pelo menos R$ 1,00.");
  }

  const agora = new Date().toISOString();

  await supabase
    .from("agendamento_taxa_rede")
    .update({ status: "cancelado" })
    .eq("id_agendamento", args.idAgendamento)
    .eq("status", "pendente");

  const { data: taxaIns, error: taxaErr } = await supabase
    .from("agendamento_taxa_rede")
    .insert({
      id_agendamento: args.idAgendamento,
      id_empresa: args.idEmpresa,
      valor,
      status: "pago",
      pago_em: agora,
      pago_em_dinheiro: true,
    })
    .select("id")
    .single();

  if (taxaErr || !taxaIns) {
    throw new Error(taxaErr?.message ?? "Erro ao registrar taxa em dinheiro.");
  }

  const { error: updAgErr } = await supabase
    .from("agendamentos")
    .update({ status: "confirmado" })
    .eq("id", args.idAgendamento);

  if (updAgErr) {
    throw new Error(updAgErr.message);
  }

  const { data: pgIns, error: pgErr } = await supabase
    .from("pagamentos")
    .insert({
      id_agendamento: args.idAgendamento,
      id_forma_pagamento: forma.id,
      valor_pago: valor,
      status_pagamento: "pago",
    })
    .select("id")
    .single();

  if (pgErr || !pgIns) {
    throw new Error(pgErr?.message ?? "Erro ao registrar pagamento.");
  }

  await registrarCaixaMovimentoTaxaSePago(supabase, taxaIns.id as number, {
    idPagamento: pgIns.id as number,
    formaPagamento: forma.nome,
  });

  return {
    idTaxa: taxaIns.id as number,
    valor,
    idFormaPagamento: forma.id,
  };
}
