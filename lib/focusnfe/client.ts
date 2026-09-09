import type {
  FocusNfseEmitirBody,
  FocusNfseRespostaCancelar,
  FocusNfseRespostaConsulta,
  FocusNfseRespostaEmitir,
} from "./types";
import { mensagemErroFocusNfseOuFallback } from "./mensagem-erro";

export class FocusNfeApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "FocusNfeApiError";
  }
}

function authHeader(token: string): string {
  const cred = Buffer.from(`${token}:`).toString("base64");
  return `Basic ${cred}`;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function mensagemErro(body: unknown, fallback: string): string {
  return mensagemErroFocusNfseOuFallback(body, fallback);
}

function urlFocus(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function focusRequestJson(
  url: string,
  token: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(60_000),
      headers: {
        accept: "application/json",
        authorization: authHeader(token),
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (e) {
    const causa =
      e instanceof Error ? e.message : "Falha de rede ao contactar a Focus NFe.";
    throw new FocusNfeApiError(
      "Não foi possível conectar à Focus NFe. Tente emitir novamente em instantes.",
      503,
      { causa },
    );
  }
  const json = await parseJson(res);
  return { ok: res.ok, status: res.status, json };
}

function erroFocus(json: unknown, status: number, fallback: string): FocusNfeApiError {
  return new FocusNfeApiError(mensagemErro(json, fallback), status, json);
}

/**
 * Belém usa layout nacional (`/v2/nfsen`). Consulta/cancelamento de refs antigas
 * ainda podem estar em `/v2/nfse`.
 */
async function focusNfseComFallback(
  baseUrl: string,
  token: string,
  ref: string,
  method: "GET" | "DELETE",
): Promise<unknown> {
  const encoded = encodeURIComponent(ref);
  const paths = [`/nfsen/${encoded}`, `/nfse/${encoded}`];
  let ultimo: { status: number; json: unknown } | null = null;
  for (const path of paths) {
    const { ok, status, json } = await focusRequestJson(urlFocus(baseUrl, path), token, {
      method,
    });
    if (ok) return json;
    ultimo = { status, json };
    if (status !== 404) {
      throw erroFocus(json, status, `Focus NFe retornou HTTP ${status}.`);
    }
  }
  throw erroFocus(
    ultimo?.json,
    ultimo?.status ?? 404,
    `Focus NFe retornou HTTP ${ultimo?.status ?? 404}.`,
  );
}

export async function focusEmitirNfse(
  baseUrl: string,
  token: string,
  ref: string,
  body: FocusNfseEmitirBody,
): Promise<FocusNfseRespostaEmitir> {
  const url = `${urlFocus(baseUrl, "/nfsen")}?ref=${encodeURIComponent(ref)}`;
  const { ok, status, json } = await focusRequestJson(url, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!ok) {
    throw erroFocus(json, status, `Focus NFe retornou HTTP ${status}.`);
  }
  return json as FocusNfseRespostaEmitir;
}

export async function focusConsultarNfse(
  baseUrl: string,
  token: string,
  ref: string,
): Promise<FocusNfseRespostaConsulta> {
  return (await focusNfseComFallback(baseUrl, token, ref, "GET")) as FocusNfseRespostaConsulta;
}

export async function focusCancelarNfse(
  baseUrl: string,
  token: string,
  ref: string,
): Promise<FocusNfseRespostaCancelar> {
  return (await focusNfseComFallback(baseUrl, token, ref, "DELETE")) as FocusNfseRespostaCancelar;
}

export type FocusWebhook = {
  id?: string | number;
  event?: string;
  url?: string;
  cnpj?: string;
  cpf?: string;
};

export type FocusCriarWebhookParams = {
  event: string;
  url: string;
  cnpj?: string;
  authorization?: string;
  authorizationHeader?: string;
};

/** Cria um gatilho (webhook) na Focus NFe. */
export async function focusCriarWebhook(
  baseUrl: string,
  token: string,
  params: FocusCriarWebhookParams,
): Promise<FocusWebhook> {
  const url = `${baseUrl.replace(/\/$/, "")}/hooks`;
  const body: Record<string, unknown> = {
    event: params.event,
    url: params.url,
  };
  if (params.cnpj) body.cnpj = params.cnpj.replace(/\D/g, "");
  if (params.authorization) body.authorization = params.authorization;
  if (params.authorizationHeader) body.authorization_header = params.authorizationHeader;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: authHeader(token),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new FocusNfeApiError(
      mensagemErro(json, `Focus NFe retornou HTTP ${res.status} ao criar webhook.`),
      res.status,
      json,
    );
  }
  return json as FocusWebhook;
}

/** Lista os gatilhos (webhooks) configurados na conta Focus NFe. */
export async function focusListarWebhooks(
  baseUrl: string,
  token: string,
): Promise<FocusWebhook[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/hooks`;
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", authorization: authHeader(token) },
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new FocusNfeApiError(
      mensagemErro(json, `Focus NFe retornou HTTP ${res.status} ao listar webhooks.`),
      res.status,
      json,
    );
  }
  if (Array.isArray(json)) return json as FocusWebhook[];
  if (json && typeof json === "object") {
    const arr = (json as { hooks?: unknown }).hooks;
    if (Array.isArray(arr)) return arr as FocusWebhook[];
  }
  return [];
}

/** Remove um gatilho (webhook) na Focus NFe pelo id. */
export async function focusRemoverWebhook(
  baseUrl: string,
  token: string,
  id: string | number,
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, "")}/hooks/${encodeURIComponent(String(id))}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { accept: "application/json", authorization: authHeader(token) },
  });
  if (!res.ok) {
    const json = await parseJson(res);
    throw new FocusNfeApiError(
      mensagemErro(json, `Focus NFe retornou HTTP ${res.status} ao remover webhook.`),
      res.status,
      json,
    );
  }
}
