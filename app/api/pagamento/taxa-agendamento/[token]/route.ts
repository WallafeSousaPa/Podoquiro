import { NextResponse } from "next/server";
import { obterConfigRede } from "@/lib/rede";
import { normalizarUrlCheckoutPaymentLinkRede } from "@/lib/rede/payment-link";
import { sincronizarTaxaComPaymentLinkRede } from "@/lib/rede/sincronizar-taxa-payment-link";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ token: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Consulta pública do link de pagamento da taxa (sem autenticação). */
export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "Link inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from("agendamento_taxa_rede")
    .select(
      `
      id,
      token,
      valor,
      status,
      rede_payment_link_id,
      rede_payment_link_url,
      expira_em,
      pago_em,
      id_agendamento,
      agendamentos (
        data_hora_inicio,
        status,
        pacientes ( nome_completo, nome_social )
      ),
      empresas ( nome_fantasia )
    `,
    )
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
  }

  const redeConfig = obterConfigRede();
  const linkRedeRaw = row.rede_payment_link_url as string | null;
  const linkPagamentoRede =
    redeConfig && linkRedeRaw
      ? normalizarUrlCheckoutPaymentLinkRede(linkRedeRaw, redeConfig)
      : linkRedeRaw;

  if (
    redeConfig &&
    row.status === "pendente" &&
    row.rede_payment_link_id &&
    typeof row.rede_payment_link_id === "string"
  ) {
    try {
      const sync = await sincronizarTaxaComPaymentLinkRede(supabase, redeConfig, {
        id: row.id as number,
        id_agendamento: row.id_agendamento as number,
        status: row.status as string,
        rede_payment_link_id: row.rede_payment_link_id,
      });
      if (sync.atualizado) {
        row.status = sync.status;
        if (sync.status === "pago") {
          row.pago_em = new Date().toISOString();
        }
      }
    } catch (e) {
      console.error("sync payment link:", e);
    }
  }

  if (row.status === "pendente" && row.expira_em) {
    const exp = new Date(row.expira_em as string);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
      await supabase
        .from("agendamento_taxa_rede")
        .update({ status: "expirado" })
        .eq("id", row.id);
      row.status = "expirado";
    }
  }

  type Ag = {
    data_hora_inicio: string;
    status: string;
    pacientes:
      | { nome_completo: string | null; nome_social: string | null }
      | { nome_completo: string | null; nome_social: string | null }[]
      | null;
  };
  const agRaw = row.agendamentos as Ag | Ag[] | null;
  const ag = Array.isArray(agRaw) ? agRaw[0] : agRaw;
  const pacRaw = ag?.pacientes;
  const pac = Array.isArray(pacRaw) ? pacRaw[0] : pacRaw;
  const empRaw = row.empresas as { nome_fantasia: string | null } | { nome_fantasia: string | null }[] | null;
  const emp = Array.isArray(empRaw) ? empRaw[0] : empRaw;

  const nomePaciente =
    pac?.nome_completo?.trim() || pac?.nome_social?.trim() || "Paciente";

  return NextResponse.json({
    data: {
      token: row.token,
      valor: Number(row.valor),
      status: row.status,
      link_pagamento_rede: linkPagamentoRede,
      expira_em: row.expira_em,
      pago_em: row.pago_em,
      nome_empresa: emp?.nome_fantasia?.trim() || null,
      nome_paciente: nomePaciente,
      data_hora_agendamento: ag?.data_hora_inicio ?? null,
    },
  });
}
