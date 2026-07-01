import type { SupabaseClient } from "@supabase/supabase-js";

export function arredondarMoeda(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Soma das taxas de agendamento já pagas online (Asaas/Rede) para abater no caixa. */
export async function somarTaxaAgendamentoPaga(
  supabase: SupabaseClient,
  idAgendamento: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("agendamento_taxa_rede")
    .select("valor")
    .eq("id_agendamento", idAgendamento)
    .eq("status", "pago");

  if (error) throw new Error(error.message);

  const soma = (data ?? []).reduce((s, r) => s + Number(r.valor), 0);
  return arredondarMoeda(soma);
}

/** Total que o paciente ainda deve pagar no caixa após descontar taxa online já paga. */
export function totalAReceberCaixaComTaxa(
  valorTotalAgendamento: number,
  taxaAgendamentoPaga: number,
): number {
  const total = arredondarMoeda(valorTotalAgendamento);
  const taxa = arredondarMoeda(taxaAgendamentoPaga);
  return Math.max(0, arredondarMoeda(total - taxa));
}
