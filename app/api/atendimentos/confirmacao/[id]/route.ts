import { NextResponse } from "next/server";
import {
  getPodeVerTodosAgendamentos,
  getUsuarioAgendaSomentePropriaColuna,
} from "@/lib/agenda/permissoes-calendario";
import { criarLinkPagamentoAsaas, expiraEmFromEndDate, obterConfigAsaas } from "@/lib/asaas";
import { getSession } from "@/lib/auth/session";
import { urlPublicaPagamentoTaxa } from "@/lib/rede/url-pagamento";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type RouteContext = { params: Promise<{ id: string }> };

/** Confirma agendamento (status → confirmado). */
export async function POST(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  const { id: idParam } = await context.params;
  const idAgendamento = Number(idParam);
  if (!Number.isFinite(idAgendamento) || idAgendamento <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const [podeVerTodos, somentePropriaColuna] = await Promise.all([
    getPodeVerTodosAgendamentos(supabase, sessionUserId),
    getUsuarioAgendaSomentePropriaColuna(supabase, sessionUserId),
  ]);

  const { data: ag, error: agErr } = await supabase
    .from("agendamentos")
    .select("id, id_empresa, id_usuario, status")
    .eq("id", idAgendamento)
    .maybeSingle();

  if (agErr) {
    console.error(agErr);
    return NextResponse.json({ error: agErr.message }, { status: 500 });
  }
  if (!ag || (ag.id_empresa as number) !== empresaId) {
    return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
  }
  if ((!podeVerTodos || somentePropriaColuna) && (ag.id_usuario as number) !== sessionUserId) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  if (ag.status !== "pendente" && ag.status !== "confirmado") {
    return NextResponse.json(
      { error: "Só é possível confirmar agendamentos pendentes ou já confirmados." },
      { status: 400 },
    );
  }

  const { error: updErr } = await supabase
    .from("agendamentos")
    .update({ status: "confirmado" })
    .eq("id", idAgendamento);

  if (updErr) {
    console.error(updErr);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: { id: idAgendamento, status: "confirmado" } });
}

/** Gera link de pagamento da taxa via Link de Pagamento Asaas. */
export async function PUT(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const asaasConfig = obterConfigAsaas();
  if (!asaasConfig) {
    return NextResponse.json(
      {
        error: "Integração Asaas não configurada. Defina ASAAS_API_KEY no servidor.",
      },
      { status: 503 },
    );
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  const { id: idParam } = await context.params;
  const idAgendamento = Number(idParam);
  if (!Number.isFinite(idAgendamento) || idAgendamento <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: { valor?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const supabase = createAdminClient();
  const [podeVerTodos, somentePropriaColuna] = await Promise.all([
    getPodeVerTodosAgendamentos(supabase, sessionUserId),
    getUsuarioAgendaSomentePropriaColuna(supabase, sessionUserId),
  ]);

  const { data: ag, error: agErr } = await supabase
    .from("agendamentos")
    .select("id, id_empresa, id_usuario, status")
    .eq("id", idAgendamento)
    .maybeSingle();

  if (agErr) {
    console.error(agErr);
    return NextResponse.json({ error: agErr.message }, { status: 500 });
  }
  if (!ag || (ag.id_empresa as number) !== empresaId) {
    return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
  }
  if ((!podeVerTodos || somentePropriaColuna) && (ag.id_usuario as number) !== sessionUserId) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { data: empRow } = await supabase
    .from("empresas")
    .select("taxa_agendamento_valor")
    .eq("id", empresaId)
    .maybeSingle();

  const valorBody = body.valor != null ? Number(body.valor) : NaN;
  const valorPadrao = Number(empRow?.taxa_agendamento_valor ?? 0);
  const valor = Number.isFinite(valorBody) && valorBody > 0 ? valorBody : valorPadrao;

  if (!Number.isFinite(valor) || valor < 1) {
    return NextResponse.json(
      {
        error:
          "Informe um valor de taxa de pelo menos R$ 1,00 ou configure taxa_agendamento_valor na empresa.",
      },
      { status: 400 },
    );
  }

  const descricao = `Taxa de agendamento #${idAgendamento}`;

  let linkResult;
  try {
    linkResult = await criarLinkPagamentoAsaas(asaasConfig, {
      valorReais: valor,
      nome: `Taxa de agendamento #${idAgendamento}`,
      descricao,
      diasExpiracao: 7,
      externalReference: `agendamento:${idAgendamento}`,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao criar link de pagamento no Asaas." },
      { status: 502 },
    );
  }

  const expiraEm =
    expiraEmFromEndDate(linkResult.endDate) ??
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await supabase
    .from("agendamento_taxa_rede")
    .update({ status: "cancelado" })
    .eq("id_agendamento", idAgendamento)
    .eq("status", "pendente");

  const { data: ins, error: insErr } = await supabase
    .from("agendamento_taxa_rede")
    .insert({
      id_agendamento: idAgendamento,
      id_empresa: empresaId,
      valor,
      status: "pendente",
      asaas_payment_link_id: linkResult.paymentLinkId,
      asaas_payment_link_url: linkResult.url,
      asaas_resposta: linkResult.respostaBruta as object,
      expira_em: expiraEm,
    })
    .select("id, token, valor, status, expira_em")
    .single();

  if (insErr || !ins) {
    console.error(insErr);
    return NextResponse.json({ error: insErr?.message ?? "Erro ao salvar link." }, { status: 500 });
  }

  const linkPagamento = await urlPublicaPagamentoTaxa(ins.token as string);

  return NextResponse.json({
    data: {
      id: ins.id,
      token: ins.token,
      valor: Number(ins.valor),
      status: ins.status,
      expira_em: ins.expira_em,
      link_pagamento: linkPagamento,
      link_pagamento_asaas: linkResult.url,
      payment_link_id: linkResult.paymentLinkId,
    },
  });
}
