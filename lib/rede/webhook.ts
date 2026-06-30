/** Eventos de pagamento aprovado via webhook Rede. */
export const REDE_WEBHOOK_EVENTO_PAGAMENTO = "PV.UPDATE_TRANSACTION_PIX";

/** Eventos de estorno/devolução Pix. */
export const REDE_WEBHOOK_EVENTO_ESTORNO = "PV.REFUND_PIX";

export const REDE_WEBHOOK_AUTH_HEADER = "X-Rede-Webhook-Secret";

export function getRedeWebhookSecret(): string | null {
  const s = process.env.REDE_WEBHOOK_SECRET?.trim();
  return s && s.length > 0 ? s : null;
}

/**
 * Valida a chamada do webhook Rede.
 * Aceita segredo via header (Authorization Bearer/Basic, X-Rede-Webhook-Secret) ou query ?secret=.
 */
export function redeWebhookAutorizado(request: Request): boolean {
  const secret = getRedeWebhookSecret();
  if (!secret) return true;

  const url = new URL(request.url);
  const viaQuery = url.searchParams.get("secret");
  if (viaQuery && viaQuery === secret) return true;

  const viaHeader = request.headers.get(REDE_WEBHOOK_AUTH_HEADER);
  if (viaHeader && viaHeader === secret) return true;

  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (!auth) return false;

  const lower = auth.toLowerCase();
  if (lower === secret.toLowerCase()) return true;
  if (lower === `bearer ${secret}`.toLowerCase()) return true;
  if (lower === `basic ${secret}`.toLowerCase()) return true;

  return false;
}

/** URL pública do webhook (para cadastro na Rede). */
export function urlPublicaWebhookRede(request: Request): string {
  const base = process.env.REDE_WEBHOOK_URL?.trim();
  let origin: string;
  if (base) {
    origin = base.replace(/\/$/, "");
    if (!/\/api\/rede\/webhook$/.test(origin)) {
      origin = `${origin}/api/rede/webhook`;
    }
  } else {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      new URL(request.url).host;
    origin = `${proto}://${host}/api/rede/webhook`;
  }

  const secret = getRedeWebhookSecret();
  if (secret) {
    const u = new URL(origin);
    u.searchParams.set("secret", secret);
    return u.toString();
  }
  return origin;
}

/** Payload de autorização enviado ao cadastrar a URL na Rede. */
export function redeWebhookAuthorizationPayload(): {
  type: "Bearer" | "Basic";
  token: string;
} | null {
  const secret = getRedeWebhookSecret();
  if (!secret) return null;
  return {
    type: "Bearer",
    token: `Bearer ${secret}`,
  };
}
