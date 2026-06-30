import type { RedeConfig } from "./config";
import { obterAccessTokenRede } from "./oauth";
import { redeWebhookAuthorizationPayload } from "./webhook";

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export type RedeRegistrarWebhookResultado = {
  returnCode: string | null;
  returnMessage: string | null;
  respostaBruta: unknown;
};

/**
 * Cadastra URL de notificação na Rede (sandbox: substitui a anterior).
 * POST /v2/transactions/notification-url
 */
export async function registrarUrlWebhookRede(
  config: RedeConfig,
  urlWebhook: string,
): Promise<RedeRegistrarWebhookResultado> {
  const token = await obterAccessTokenRede(config);
  const endpoint = `${config.transactionsBaseUrl.replace(/\/$/, "")}/v2/transactions/notification-url`;

  const body: Record<string, unknown> = { url: urlWebhook };
  const auth = redeWebhookAuthorizationPayload();
  if (auth) {
    body.authorization = auth;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await parseJson(res);
  const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};

  if (!res.ok) {
    const msg =
      (typeof o.returnMessage === "string" && o.returnMessage) ||
      (typeof o.message === "string" && o.message) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return {
    returnCode: typeof o.returnCode === "string" ? o.returnCode : null,
    returnMessage: typeof o.returnMessage === "string" ? o.returnMessage : null,
    respostaBruta: json,
  };
}
