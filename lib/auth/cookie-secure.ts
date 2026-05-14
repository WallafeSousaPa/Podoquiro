/**
 * Cookies com `secure: true` não são gravados em HTTP (ex.: LAN `http://192.168.x.x`).
 * Não use só `NODE_ENV === "production"` para decidir `secure`.
 */
export function cookieSecureFromRequest(request: Request): boolean {
  try {
    const u = new URL(request.url);
    if (u.protocol === "https:") return true;
  } catch {
    return false;
  }
  const xf = request.headers.get("x-forwarded-proto");
  const first = xf?.split(",")[0]?.trim().toLowerCase();
  return first === "https";
}

/** Para Server Actions / `headers()` (sem `Request.url`). */
export function cookieSecureFromHeaders(h: Headers): boolean {
  const xf = h.get("x-forwarded-proto");
  if (xf?.split(",")[0]?.trim().toLowerCase() === "https") return true;
  const forwarded = h.get("forwarded");
  if (forwarded) {
    for (const part of forwarded.split(",")) {
      const m = /proto=([^\s;]+)/i.exec(part);
      if (m?.[1]?.toLowerCase() === "https") return true;
    }
  }
  return false;
}
