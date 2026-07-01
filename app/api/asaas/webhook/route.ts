import { NextResponse } from "next/server";
import { obterConfigAsaas } from "@/lib/asaas";
import { statusInternoTaxaFromAsaas } from "@/lib/asaas/payment-link";
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
  const paymentLinkId = typeof payment?.paymentLink === "string" ? payment.paymentLink : null;

  // Sem link de pagamento associado: ignora (não é do nosso fluxo de taxa).
  if (!payment || !paymentLinkId) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const statusPagamento = typeof payment.status === "string" ? payment.status : null;
  const map = statusInternoTaxaFromAsaas(statusPagamento);
  if (!map.status) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const supabase = createAdminClient();
  const { data: taxa } = await supabase
    .from("agendamento_taxa_rede")
    .select("id, id_agendamento, status")
    .eq("asaas_payment_link_id", paymentLinkId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!taxa) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  if (taxa.status === "pago" || taxa.status === "cancelado" || taxa.status === "expirado") {
    return NextResponse.json({ ok: true, atualizado: false });
  }

  const patch: Record<string, unknown> = {
    status: map.status,
    asaas_payment_id: typeof payment.id === "string" ? payment.id : null,
    asaas_resposta: body as object,
  };
  if (map.status === "pago") patch.pago_em = new Date().toISOString();

  await supabase.from("agendamento_taxa_rede").update(patch).eq("id", taxa.id);

  if (map.confirmarAgendamento) {
    await supabase
      .from("agendamentos")
      .update({ status: "confirmado" })
      .eq("id", taxa.id_agendamento)
      .eq("status", "pendente");
  }

  return NextResponse.json({ ok: true, atualizado: true });
}
