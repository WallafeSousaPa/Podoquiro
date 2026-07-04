import type { SupabaseClient } from "@supabase/supabase-js";
import type { AsaasConfig } from "./config";
import { consultarPagamentoDoLinkAsaas, statusInternoTaxaFromAsaas } from "./payment-link";
import { labelFormaPagamentoFromAsaasBillingType } from "@/lib/financeiro/taxa-forma-pagamento";
import { registrarCaixaMovimentoTaxaSePago } from "@/lib/financeiro/caixa-movimento";

type TaxaRow = {
  id: number;
  id_agendamento: number;
  status: string;
  asaas_payment_link_id: string | null;
};

/** Consulta status no Asaas e atualiza agendamento_taxa_rede + agendamento. */
export async function sincronizarTaxaComPaymentLinkAsaas(
  supabase: SupabaseClient,
  config: AsaasConfig,
  taxa: TaxaRow,
): Promise<{ atualizado: boolean; status: string; statusAsaas: string | null }> {
  const linkId = taxa.asaas_payment_link_id?.trim();
  if (!linkId) {
    return { atualizado: false, status: taxa.status, statusAsaas: null };
  }

  if (taxa.status === "pago" || taxa.status === "cancelado" || taxa.status === "expirado") {
    if (taxa.status === "pago") {
      try {
        await registrarCaixaMovimentoTaxaSePago(supabase, taxa.id);
      } catch (e) {
        console.error("caixa_movimento taxa asaas sync:", e);
      }
    }
    return { atualizado: false, status: taxa.status, statusAsaas: null };
  }

  const detalhe = await consultarPagamentoDoLinkAsaas(config, linkId);
  const map = statusInternoTaxaFromAsaas(detalhe.statusPagamento);
  if (!map.status) {
    return { atualizado: false, status: taxa.status, statusAsaas: detalhe.statusPagamento };
  }

  const patch: Record<string, unknown> = {
    asaas_resposta: detalhe.respostaBruta as object,
  };
  if (detalhe.paymentId) patch.asaas_payment_id = detalhe.paymentId;

  if (map.status !== taxa.status) {
    patch.status = map.status;
    if (map.status === "pago") {
      patch.pago_em = new Date().toISOString();
    }
  }

  await supabase.from("agendamento_taxa_rede").update(patch).eq("id", taxa.id);

  if (map.status === "pago") {
    const forma =
      labelFormaPagamentoFromAsaasBillingType(detalhe.billingType) ?? undefined;
    try {
      await registrarCaixaMovimentoTaxaSePago(supabase, taxa.id, {
        formaPagamento: forma,
      });
    } catch (e) {
      console.error("caixa_movimento taxa asaas sync:", e);
    }
  }

  if (map.confirmarAgendamento) {
    await supabase
      .from("agendamentos")
      .update({ status: "confirmado" })
      .eq("id", taxa.id_agendamento)
      .eq("status", "pendente");
  }

  return {
    atualizado: map.status !== taxa.status,
    status: map.status,
    statusAsaas: detalhe.statusPagamento,
  };
}
