/** Evento Focus NFe para mudança de status das NFS-e que emitimos. */
export const FOCUS_WEBHOOK_EVENT_NFSE = "nfse";

/** Nome do cabeçalho HTTP usado para autenticar o webhook da Focus. */
export const FOCUS_WEBHOOK_AUTH_HEADER = "X-Focus-Webhook-Secret";

/** Segredo configurado para validar as chamadas do webhook. */
export function getFocusWebhookSecret(): string | null {
  const s = process.env.FOCUSNFE_WEBHOOK_SECRET?.trim();
  return s && s.length > 0 ? s : null;
}

/**
 * Valida a autenticidade da chamada do webhook.
 * Aceita o segredo via header (FOCUS_WEBHOOK_AUTH_HEADER ou Authorization) ou query `?secret=`.
 * Se nenhum segredo estiver configurado no servidor, libera (modo aberto, recomendado só em dev).
 */
export function webhookAutorizado(request: Request): boolean {
  const secret = getFocusWebhookSecret();
  if (!secret) return true;

  const url = new URL(request.url);
  const viaQuery = url.searchParams.get("secret");
  if (viaQuery && viaQuery === secret) return true;

  const viaHeader = request.headers.get(FOCUS_WEBHOOK_AUTH_HEADER);
  if (viaHeader && viaHeader === secret) return true;

  const auth = request.headers.get("authorization");
  if (auth && (auth === secret || auth === `Bearer ${secret}`)) return true;

  return false;
}

/**
 * URL pública que a Focus deve chamar. Prefere FOCUSNFE_WEBHOOK_URL; senão deriva do request.
 * Inclui o segredo em querystring para facilitar o registro quando não há header customizado.
 */
export function urlPublicaWebhook(request: Request): string {
  const base = process.env.FOCUSNFE_WEBHOOK_URL?.trim();
  let origin: string;
  if (base) {
    origin = base.replace(/\/$/, "");
    if (!/\/api\/focusnfe\/webhook$/.test(origin)) {
      origin = `${origin}/api/focusnfe/webhook`;
    }
  } else {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      new URL(request.url).host;
    origin = `${proto}://${host}/api/focusnfe/webhook`;
  }
  return origin;
}
