import type { SupabaseClient } from "@supabase/supabase-js";
import type { RedeConfig } from "./config";
import {
  consultarLinkPagamentoRede,
  expiraEmFromPaymentLink,
  statusInternoTaxaFromRede,
} from "./payment-link";

type TaxaRow = {
  id: number;
  id_agendamento: number;
  status: string;
  rede_payment_link_id: string | null;
};

/** Consulta status na Rede e atualiza agendamento_taxa_rede + agendamento. */
export async function sincronizarTaxaComPaymentLinkRede(
  supabase: SupabaseClient,
  config: RedeConfig,
  taxa: TaxaRow,
): Promise<{ atualizado: boolean; status: string; statusRede: string | null }> {
  const linkId = taxa.rede_payment_link_id?.trim();
  if (!linkId) {
    return { atualizado: false, status: taxa.status, statusRede: null };
  }

  if (taxa.status === "pago" || taxa.status === "cancelado" || taxa.status === "expirado") {
    return { atualizado: false, status: taxa.status, statusRede: null };
  }

  const detalhe = await consultarLinkPagamentoRede(config, linkId);
  const map = statusInternoTaxaFromRede(detalhe.statusRede);
  if (!map.status) {
    return { atualizado: false, status: taxa.status, statusRede: detalhe.statusRede };
  }

  const patch: Record<string, unknown> = {
    rede_resposta: detalhe.respostaBruta as object,
  };
  if (detalhe.url) patch.rede_payment_link_url = detalhe.url;

  const expiraIso = expiraEmFromPaymentLink(detalhe.expirationDate);
  if (expiraIso) patch.expira_em = expiraIso;

  if (map.status !== taxa.status) {
    patch.status = map.status;
    if (map.status === "pago") {
      patch.pago_em = new Date().toISOString();
    }
  }

  await supabase.from("agendamento_taxa_rede").update(patch).eq("id", taxa.id);

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
    statusRede: detalhe.statusRede,
  };
}
