import { NextResponse } from "next/server";
import { getPodeVerTodosAgendamentos } from "@/lib/agenda/permissoes-calendario";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNfseNoCaixa } from "@/lib/dashboard/nota-fiscal-permissao";
import { agendamentoPagamentoQuitado } from "@/lib/financeiro/agendamento-pagamento-quitado";
import {
  FocusNfeApiError,
  discriminacaoDeProcedimentos,
  focusEmitirNfse,
  gerarRefFocusNfse,
  montarPayloadFocusNfse,
  bloqueiaReemissaoFocusNfse,
  obterConfigFocusNfe,
  obterTokenFocusNfe,
  statusInternoDeFocus,
  validarConfigFocusParaEmissao,
} from "@/lib/focusnfe";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(request: Request) {
  const session = await getSession();
  const negado = await respostaSeSemPermissaoNfseNoCaixa(session);
  if (negado) return negado;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session!.sub);

  let body: { id_agendamento?: number; iss_retido?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const idAgendamento = body.id_agendamento;
  if (!idAgendamento || !Number.isFinite(idAgendamento)) {
    return NextResponse.json({ error: "Informe id_agendamento." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const config = await obterConfigFocusNfe(supabase, empresaId);
  if (!config) {
    return NextResponse.json(
      { error: "Configure os parâmetros Focus NFe antes de emitir." },
      { status: 400 },
    );
  }

  const token = await obterTokenFocusNfe(supabase, empresaId);
  const erroConfig = validarConfigFocusParaEmissao(config, Boolean(token));
  if (erroConfig) {
    return NextResponse.json({ error: erroConfig }, { status: 400 });
  }

  const podeVerTodos = await getPodeVerTodosAgendamentos(supabase, sessionUserId);

  let q = supabase
    .from("agendamentos")
    .select(
      `
        id,
        id_paciente,
        id_usuario,
        status,
        valor_total,
        pacientes (
          cpf, nome_completo, nome_social, email, telefone,
          cep, logradouro, numero, complemento, bairro, cidade, uf
        ),
        agendamento_procedimentos (
          procedimentos ( procedimento )
        ),
        pagamentos ( status_pagamento )
      `,
    )
    .eq("id", idAgendamento)
    .eq("id_empresa", empresaId);

  if (!podeVerTodos) {
    q = q.eq("id_usuario", sessionUserId);
  }

  const { data: ag, error: agErr } = await q.maybeSingle();
  if (agErr) {
    return NextResponse.json({ error: agErr.message }, { status: 500 });
  }
  if (!ag) {
    return NextResponse.json({ error: "Atendimento não encontrado." }, { status: 404 });
  }
  if (String(ag.status) !== "realizado") {
    return NextResponse.json(
      { error: "Atendimento deve estar com status realizado." },
      { status: 400 },
    );
  }

  const pags = (ag.pagamentos as { status_pagamento: string }[] | null) ?? [];
  if (!agendamentoPagamentoQuitado(pags)) {
    return NextResponse.json(
      { error: "Pagamento do atendimento não está quitado." },
      { status: 400 },
    );
  }

  const { data: emissaoExistente } = await supabase
    .from("nfse_focus_emissoes")
    .select("id, status, numero_nfse")
    .eq("id_empresa", empresaId)
    .eq("id_agendamento", idAgendamento)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (emissaoExistente && bloqueiaReemissaoFocusNfse(emissaoExistente.status as string)) {
    const msg =
      (emissaoExistente.status as string).toLowerCase() === "autorizado"
        ? `Este atendimento já possui NFS-e emitida${emissaoExistente.numero_nfse ? ` (nº ${emissaoExistente.numero_nfse})` : ""}.`
        : "Já existe uma NFS-e em processamento para este atendimento.";
    return NextResponse.json({ error: msg, emissao: emissaoExistente }, { status: 409 });
  }

  const pacRaw = ag.pacientes as
    | {
        cpf: string | null;
        nome_completo: string | null;
        nome_social: string | null;
        email: string | null;
        telefone: string | null;
        cep: string | null;
        logradouro: string | null;
        numero: string | null;
        complemento: string | null;
        bairro: string | null;
        cidade: string | null;
        uf: string | null;
      }
    | {
        cpf: string | null;
        nome_completo: string | null;
        nome_social: string | null;
        email: string | null;
        telefone: string | null;
        cep: string | null;
        logradouro: string | null;
        numero: string | null;
        complemento: string | null;
        bairro: string | null;
        cidade: string | null;
        uf: string | null;
      }[]
    | null;
  const paciente = Array.isArray(pacRaw) ? pacRaw[0] : pacRaw;
  if (!paciente) {
    return NextResponse.json({ error: "Paciente não encontrado." }, { status: 404 });
  }

  const procsRaw = ag.agendamento_procedimentos as
    | { procedimentos: { procedimento: string | null } | { procedimento: string | null }[] }[]
    | null;
  const procedimentos = (procsRaw ?? []).map((ap) => {
    const pr = ap.procedimentos;
    const p0 = Array.isArray(pr) ? pr[0] : pr;
    return { procedimento: p0?.procedimento ?? null };
  });

  const valorTotal = Number(ag.valor_total);
  let discriminacao: string;
  try {
    discriminacao = discriminacaoDeProcedimentos(procedimentos);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Discriminação inválida." },
      { status: 400 },
    );
  }

  let payload;
  try {
    payload = montarPayloadFocusNfse({
      config,
      paciente,
      valorServicos: valorTotal,
      discriminacao,
      issRetido: body.iss_retido,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Dados inválidos para NFS-e." },
      { status: 400 },
    );
  }

  const ref = gerarRefFocusNfse(idAgendamento);

  let resposta;
  try {
    resposta = await focusEmitirNfse(config.baseUrl, token!, ref, payload);
  } catch (e) {
    if (e instanceof FocusNfeApiError) {
      return NextResponse.json(
        { error: e.message, detalhe: e.body },
        { status: e.status >= 400 && e.status < 600 ? e.status : 502 },
      );
    }
    throw e;
  }

  const status = statusInternoDeFocus(resposta.status);

  const { data: row, error: insErr } = await supabase
    .from("nfse_focus_emissoes")
    .insert({
      id_empresa: empresaId,
      id_agendamento: idAgendamento,
      id_paciente: ag.id_paciente,
      focus_ref: ref,
      status: resposta.status ?? "processando_autorizacao",
      numero_rps: resposta.numero_rps ?? null,
      serie_rps: resposta.serie_rps ?? null,
      tipo_rps: resposta.tipo_rps ?? null,
      valor_servicos: valorTotal,
      discriminacao,
      payload_envio: payload,
      payload_resposta: resposta,
    })
    .select("id, focus_ref, status, numero_rps, serie_rps")
    .single();

  if (insErr) {
    return NextResponse.json(
      {
        error: `Nota enviada à Focus (ref ${ref}), mas falhou ao gravar localmente: ${insErr.message}`,
        focus: resposta,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    emissao: row,
    focus: resposta,
    status_interno: status,
  });
}
