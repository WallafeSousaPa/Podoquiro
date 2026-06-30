import type { RedeConfig } from "./config";

type TokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

let cache: TokenCache | null = null;

const BUFFER_MS = 60_000;

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function mensagemErroOAuth(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const msg =
      (typeof o.error_description === "string" && o.error_description) ||
      (typeof o.message === "string" && o.message) ||
      (typeof o.error === "string" && o.error);
    if (msg) return msg;
  }
  return `Rede OAuth retornou HTTP ${status}.`;
}

/** Obtém access_token OAuth 2.0 (client_credentials) com cache em memória. */
export async function obterAccessTokenRede(config: RedeConfig): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAtMs - BUFFER_MS > now) {
    return cache.accessToken;
  }

  const cred = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const res = await fetch(config.oauthUrl, {
    method: "POST",
    headers: {
      authorization: `Basic ${cred}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });

  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(mensagemErroOAuth(body, res.status));
  }

  const o = body as Record<string, unknown>;
  const accessToken = typeof o.access_token === "string" ? o.access_token : "";
  const expiresIn = typeof o.expires_in === "number" ? o.expires_in : 1440;
  if (!accessToken) {
    throw new Error("Rede OAuth não retornou access_token.");
  }

  cache = {
    accessToken,
    expiresAtMs: now + expiresIn * 1000,
  };
  return accessToken;
}

/** Limpa cache (útil em testes). */
export function limparCacheTokenRede(): void {
  cache = null;
}
