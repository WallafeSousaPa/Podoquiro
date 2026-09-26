import type { SupabaseClient } from "@supabase/supabase-js";
import type { AsaasConfig } from "@/lib/asaas/config";
import { cancelarCobrancaAsaasSePendente } from "@/lib/asaas/cobranca";

/** True se o agendamento já tem taxa de agendamento paga. */
export async function agendamentoTemTaxaPaga(
  supabase: SupabaseClient,
  idAgendamento: number,
): Promise<boolean> {
  if (!Number.isFinite(idAgendamento) || idAgendamento <= 0) return false;
  const { data, error } = await supabase
    .from("agendamento_taxa_rede")
    .select("id")
    .eq("id_agendamento", idAgendamento)
    .eq("status", "pago")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data != null;
}

/**
 * Taxa já paga e o horário ainda está pendente: recoloca confirmado.
 * Idempotente (só atualiza se o status atual for pendente).
 */
export async function confirmarAgendamentoPendentePorTaxaPaga(
  supabase: SupabaseClient,
  idAgendamento: number,
): Promise<void> {
  if (!Number.isFinite(idAgendamento) || idAgendamento <= 0) return;
  const { error } = await supabase
    .from("agendamentos")
    .update({ status: "confirmado" })
    .eq("id", idAgendamento)
    .eq("status", "pendente");
  if (error) {
    console.error("confirmarAgendamentoPendentePorTaxaPaga:", error);
  }
}

type TaxaPendenteRow = {
  id: number;
  asaas_payment_id: string | null;
};

/**
 * Marca taxas pendentes do agendamento como canceladas.
 * Tenta cancelar a cobrança no Asaas para o link antigo deixar de aceitar pagamento.
 * Se o Asaas já tiver recebido o pagamento de um link antigo, devolve o id dessa taxa.
 */
export async function cancelarTaxasPendentesAgendamento(
  supabase: SupabaseClient,
  idAgendamento: number,
  opts?: { asaasConfig?: AsaasConfig | null; excetoIdTaxa?: number },
): Promise<{ jaPagoRemotoIdTaxa: number | null }> {
  if (!Number.isFinite(idAgendamento) || idAgendamento <= 0) {
    return { jaPagoRemotoIdTaxa: null };
  }

  let q = supabase
    .from("agendamento_taxa_rede")
    .select("id, asaas_payment_id")
    .eq("id_agendamento", idAgendamento)
    .eq("status", "pendente");
  if (opts?.excetoIdTaxa != null) {
    q = q.neq("id", opts.excetoIdTaxa);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const pendentes = (data ?? []) as TaxaPendenteRow[];
  const config = opts?.asaasConfig ?? null;

  for (const t of pendentes) {
    const pid = t.asaas_payment_id?.trim();
    if (config && pid) {
      const r = await cancelarCobrancaAsaasSePendente(config, pid);
      if (r === "ja_paga") {
        return { jaPagoRemotoIdTaxa: t.id };
      }
    }
  }

  let upd = supabase
    .from("agendamento_taxa_rede")
    .update({ status: "cancelado" })
    .eq("id_agendamento", idAgendamento)
    .eq("status", "pendente");
  if (opts?.excetoIdTaxa != null) {
    upd = upd.neq("id", opts.excetoIdTaxa);
  }
  const { error: updErr } = await upd;
  if (updErr) throw new Error(updErr.message);

  return { jaPagoRemotoIdTaxa: null };
}

/** Marca a taxa como paga (mesmo que estivesse cancelada/expirada) e confirma o agendamento. */
export async function efetivarTaxaPagaMesmoSeCancelada(
  supabase: SupabaseClient,
  args: {
    idTaxa: number;
    idAgendamento: number;
    asaasPaymentId?: string | null;
    respostaBruta?: object;
  },
): Promise<void> {
  const patch: Record<string, unknown> = {
    status: "pago",
    pago_em: new Date().toISOString(),
  };
  if (args.asaasPaymentId) patch.asaas_payment_id = args.asaasPaymentId;
  if (args.respostaBruta) patch.asaas_resposta = args.respostaBruta;

  const { error } = await supabase
    .from("agendamento_taxa_rede")
    .update(patch)
    .eq("id", args.idTaxa);
  if (error) throw new Error(error.message);

  await confirmarAgendamentoPendentePorTaxaPaga(supabase, args.idAgendamento);
}
