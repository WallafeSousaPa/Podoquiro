import { NextResponse } from "next/server";
import { obterConfigAsaas } from "@/lib/asaas";
import { statusInternoTaxaFromAsaas } from "@/lib/asaas/payment-link";
import { registrarCaixaMovimentoTaxaSePago } from "@/lib/financeiro/caixa-movimento";
import { labelFormaPagamentoFromAsaasBillingType } from "@/lib/financeiro/taxa-forma-pagamento";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook de cobranças do Asaas.
 * Configure em: Asaas → Integrações → Webhooks (URL desta rota).
 * Se ASAAS_WEBHOOK_TOKEN estiver definido, valide o header asaas-access-token.
 * Docs: https://docs.asaas.com/docs/webhook-para-cobrancas
 */
export async function POST(request: Request) {
  const config = obterConfigAsaas();
  if (!config) {
    return NextResponse.json({ error: "Asaas não configurado." }, { status: 503 });
  }

  if (config.webhookToken) {
    const token = request.headers.get("asaas-access-token");
    if (token !== config.webhookToken) {
      return NextResponse.json({ error: "Token inválido." }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const payment =
    body.payment && typeof body.payment === "object"
      ? (body.payment as Record<string, unknown>)
      : null;

  if (!payment) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const paymentId = typeof payment.id === "string" ? payment.id : null;
  const paymentLinkId = typeof payment.paymentLink === "string" ? payment.paymentLink : null;
  const externalReference =
    typeof payment.externalReference === "string" ? payment.externalReference : null;

  const statusPagamento = typeof payment.status === "string" ? payment.status : null;
  const map = statusInternoTaxaFromAsaas(statusPagamento);
  if (!map.status) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const supabase = createAdminClient();
  let taxa: { id: number; id_agendamento: number; status: string } | null = null;

  if (paymentId) {
    const { data } = await supabase
      .from("agendamento_taxa_rede")
      .select("id, id_agendamento, status")
      .eq("asaas_payment_id", paymentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    taxa = data;
  }

  if (!taxa && paymentLinkId) {
    const { data } = await supabase
      .from("agendamento_taxa_rede")
      .select("id, id_agendamento, status")
      .eq("asaas_payment_link_id", paymentLinkId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    taxa = data;
  }

  if (!taxa && externalReference?.startsWith("agendamento:")) {
    const idAgendamento = Number(externalReference.slice("agendamento:".length));
    if (Number.isFinite(idAgendamento) && idAgendamento > 0) {
      const { data } = await supabase
        .from("agendamento_taxa_rede")
        .select("id, id_agendamento, status")
        .eq("id_agendamento", idAgendamento)
        .eq("status", "pendente")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      taxa = data;
    }
  }

  if (!taxa) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  if (taxa.status === "pago" || taxa.status === "cancelado" || taxa.status === "expirado") {
    if (taxa.status === "pago") {
      try {
        await registrarCaixaMovimentoTaxaSePago(supabase, taxa.id as number, {
          formaPagamento:
            labelFormaPagamentoFromAsaasBillingType(
              typeof payment.billingType === "string" ? payment.billingType : null,
            ) ?? undefined,
        });
      } catch (e) {
        console.error("caixa_movimento taxa asaas:", e);
      }
    }
    return NextResponse.json({ ok: true, atualizado: false });
  }

  const patch: Record<string, unknown> = {
    status: map.status,
    asaas_payment_id: paymentId,
    asaas_resposta: body as object,
  };
  if (map.status === "pago") patch.pago_em = new Date().toISOString();

  await supabase.from("agendamento_taxa_rede").update(patch).eq("id", taxa.id);

  if (map.status === "pago") {
    const billingType =
      typeof payment.billingType === "string" ? payment.billingType : null;
    const forma =
      labelFormaPagamentoFromAsaasBillingType(billingType) ?? undefined;
    try {
      await registrarCaixaMovimentoTaxaSePago(supabase, taxa.id as number, {
        formaPagamento: forma,
      });
    } catch (e) {
      console.error("caixa_movimento taxa asaas:", e);
    }
  }

  if (map.confirmarAgendamento) {
    await supabase
      .from("agendamentos")
      .update({ status: "confirmado" })
      .eq("id", taxa.id_agendamento)
      .eq("status", "pendente");
  }

  return NextResponse.json({ ok: true, atualizado: true });
}
