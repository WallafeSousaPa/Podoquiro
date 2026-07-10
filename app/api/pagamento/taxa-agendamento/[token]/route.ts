import { NextResponse } from "next/server";
import { obterConfigAsaas } from "@/lib/asaas";
import { sincronizarTaxaComPaymentLinkAsaas } from "@/lib/asaas/sincronizar-taxa";
import { registrarCaixaMovimentoTaxaSePago } from "@/lib/financeiro/caixa-movimento";
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
      asaas_payment_link_id,
      asaas_payment_link_url,
      asaas_payment_id,
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

  const asaasConfig = obterConfigAsaas();
  const linkPagamentoAsaas = row.asaas_payment_link_url as string | null;

  if (
    asaasConfig &&
    row.status === "pendente" &&
    (row.asaas_payment_id || row.asaas_payment_link_id)
  ) {
    try {
      const sync = await sincronizarTaxaComPaymentLinkAsaas(supabase, asaasConfig, {
        id: row.id as number,
        id_agendamento: row.id_agendamento as number,
        status: row.status as string,
        asaas_payment_id:
          typeof row.asaas_payment_id === "string" ? row.asaas_payment_id : null,
        asaas_payment_link_id:
          typeof row.asaas_payment_link_id === "string" ? row.asaas_payment_link_id : null,
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

  if (row.status === "pago") {
    try {
      await registrarCaixaMovimentoTaxaSePago(supabase, row.id as number);
    } catch (e) {
      console.error("caixa_movimento taxa token:", e);
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
      link_pagamento_asaas: linkPagamentoAsaas,
      expira_em: row.expira_em,
      pago_em: row.pago_em,
      nome_empresa: emp?.nome_fantasia?.trim() || null,
      nome_paciente: nomePaciente,
      data_hora_agendamento: ag?.data_hora_inicio ?? null,
    },
  });
}
