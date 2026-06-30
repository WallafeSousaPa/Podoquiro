import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { obterConfigRede, redeConfigurada } from "@/lib/rede/config";
import { registrarUrlWebhookRede } from "@/lib/rede/registrar-webhook";
import {
  getRedeWebhookSecret,
  redeWebhookAuthorizationPayload,
  urlPublicaWebhookRede,
} from "@/lib/rede/webhook";

/** Status do webhook Rede (URL pública e segredo). */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  return NextResponse.json({
    configurado: redeConfigurada(),
    url_webhook: urlPublicaWebhookRede(request),
    tem_segredo: Boolean(getRedeWebhookSecret()),
    authorization_payload: redeWebhookAuthorizationPayload(),
  });
}

/** Cadastra/substitui a URL de notificação na Rede (sandbox). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const config = obterConfigRede();
  if (!config) {
    return NextResponse.json(
      {
        error:
          "Integração Rede não configurada (REDE_CLIENT_ID, REDE_CLIENT_SECRET, REDE_MERCHANT_ID).",
      },
      { status: 503 },
    );
  }

  const urlWebhook = urlPublicaWebhookRede(request);
  if (/localhost|127\.0\.0\.1/i.test(urlWebhook)) {
    return NextResponse.json(
      {
        error:
          "URL do webhook aponta para localhost — a Rede não consegue acessá-la. Defina REDE_WEBHOOK_URL ou NEXT_PUBLIC_APP_URL com HTTPS público.",
      },
      { status: 400 },
    );
  }

  try {
    const res = await registrarUrlWebhookRede(config, urlWebhook);
    return NextResponse.json({
      ok: true,
      url_webhook: urlWebhook,
      return_code: res.returnCode,
      return_message: res.returnMessage,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao registrar webhook na Rede." },
      { status: 502 },
    );
  }
}
