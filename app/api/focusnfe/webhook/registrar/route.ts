import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNotaFiscal } from "@/lib/dashboard/nota-fiscal-permissao";
import {
  FocusNfeApiError,
  focusCriarWebhook,
  focusListarWebhooks,
  focusRemoverWebhook,
  obterConfigFocusNfe,
  obterTokenFocusNfe,
} from "@/lib/focusnfe";
import {
  FOCUS_WEBHOOK_AUTH_HEADER,
  FOCUS_WEBHOOK_EVENT_NFSE,
  getFocusWebhookSecret,
  urlPublicaWebhook,
} from "@/lib/focusnfe/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function tratarErroFocus(e: unknown): NextResponse | never {
  if (e instanceof FocusNfeApiError) {
    return NextResponse.json(
      { error: e.message, detalhe: e.body },
      { status: e.status >= 400 && e.status < 600 ? e.status : 502 },
    );
  }
  throw e;
}

/** Status atual do webhook: URL pública, segredo configurado e gatilhos já existentes na Focus. */
export async function GET(request: Request) {
  const session = await getSession();
  const negado = await respostaSeSemPermissaoNotaFiscal(session);
  if (negado) return negado;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const config = await obterConfigFocusNfe(supabase, empresaId);
  const token = await obterTokenFocusNfe(supabase, empresaId);

  const { data: cfgRow } = await supabase
    .from("empresa_focusnfe_config")
    .select("webhook_focus_id, webhook_url, webhook_registrado_em")
    .eq("id_empresa", empresaId)
    .maybeSingle();

  const urlWebhook = urlPublicaWebhook(request);
  const temSegredo = Boolean(getFocusWebhookSecret());

  let hooks: unknown[] = [];
  let erroLista: string | null = null;
  if (config && token) {
    try {
      hooks = await focusListarWebhooks(config.baseUrl, token);
    } catch (e) {
      erroLista =
        e instanceof Error ? e.message : "Não foi possível listar os webhooks na Focus.";
    }
  }

  return NextResponse.json({
    url_webhook: urlWebhook,
    tem_segredo: temSegredo,
    event: FOCUS_WEBHOOK_EVENT_NFSE,
    configurado: Boolean(config && token),
    webhook_focus_id: cfgRow?.webhook_focus_id ?? null,
    webhook_url: cfgRow?.webhook_url ?? null,
    webhook_registrado_em: cfgRow?.webhook_registrado_em ?? null,
    hooks,
    erro_lista: erroLista,
  });
}

/** Registra (ou re-registra) o gatilho do evento `nfse` apontando para o nosso receiver. */
export async function POST(request: Request) {
  const session = await getSession();
  const negado = await respostaSeSemPermissaoNotaFiscal(session);
  if (negado) return negado;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const config = await obterConfigFocusNfe(supabase, empresaId);
  if (!config) {
    return NextResponse.json({ error: "Focus NFe não configurado." }, { status: 400 });
  }
  const token = await obterTokenFocusNfe(supabase, empresaId);
  if (!token) {
    return NextResponse.json({ error: "Token Focus NFe não configurado." }, { status: 400 });
  }

  const urlWebhook = urlPublicaWebhook(request);
  if (/localhost|127\.0\.0\.1/.test(urlWebhook)) {
    return NextResponse.json(
      {
        error:
          "URL do webhook aponta para localhost — a Focus não consegue acessá-la. Defina FOCUSNFE_WEBHOOK_URL com a URL pública do app.",
      },
      { status: 400 },
    );
  }

  const segredo = getFocusWebhookSecret();

  let hook;
  try {
    hook = await focusCriarWebhook(config.baseUrl, token, {
      event: FOCUS_WEBHOOK_EVENT_NFSE,
      url: urlWebhook,
      cnpj: config.prestadorCnpj || undefined,
      authorization: segredo ?? undefined,
      authorizationHeader: segredo ? FOCUS_WEBHOOK_AUTH_HEADER : undefined,
    });
  } catch (e) {
    return tratarErroFocus(e);
  }

  const webhookId = hook?.id != null ? String(hook.id) : null;
  await supabase
    .from("empresa_focusnfe_config")
    .update({
      webhook_focus_id: webhookId,
      webhook_url: urlWebhook,
      webhook_registrado_em: new Date().toISOString(),
    })
    .eq("id_empresa", empresaId);

  return NextResponse.json({
    ok: true,
    webhook_focus_id: webhookId,
    url_webhook: urlWebhook,
    tem_segredo: Boolean(segredo),
    hook,
  });
}

/** Remove o gatilho registrado (usa o id salvo ou o informado no corpo). */
export async function DELETE(request: Request) {
  const session = await getSession();
  const negado = await respostaSeSemPermissaoNotaFiscal(session);
  if (negado) return negado;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let body: { id?: string | number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const supabase = createAdminClient();
  const config = await obterConfigFocusNfe(supabase, empresaId);
  const token = await obterTokenFocusNfe(supabase, empresaId);
  if (!config || !token) {
    return NextResponse.json({ error: "Focus NFe não configurado." }, { status: 400 });
  }

  let id = body.id;
  if (id == null) {
    const { data } = await supabase
      .from("empresa_focusnfe_config")
      .select("webhook_focus_id")
      .eq("id_empresa", empresaId)
      .maybeSingle();
    id = data?.webhook_focus_id ?? undefined;
  }

  if (id == null) {
    return NextResponse.json({ error: "Nenhum webhook registrado para remover." }, { status: 400 });
  }

  try {
    await focusRemoverWebhook(config.baseUrl, token, id);
  } catch (e) {
    return tratarErroFocus(e);
  }

  await supabase
    .from("empresa_focusnfe_config")
    .update({ webhook_focus_id: null, webhook_url: null, webhook_registrado_em: null })
    .eq("id_empresa", empresaId);

  return NextResponse.json({ ok: true });
}
