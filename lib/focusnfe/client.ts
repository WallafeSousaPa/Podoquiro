import type {
  FocusNfseEmitirBody,
  FocusNfseRespostaCancelar,
  FocusNfseRespostaConsulta,
  FocusNfseRespostaEmitir,
} from "./types";

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
  if (!body || typeof body !== "object") return fallback;
  const o = body as Record<string, unknown>;
  if (typeof o.mensagem === "string" && o.mensagem.trim()) return o.mensagem.trim();
  const erros = o.erros;
  if (Array.isArray(erros) && erros.length > 0) {
    const parts = erros.map((e) => {
      if (!e || typeof e !== "object") return String(e);
      const item = e as { codigo?: string; mensagem?: string };
      return [item.codigo, item.mensagem].filter(Boolean).join(": ");
    });
    return parts.join(" | ") || fallback;
  }
  return fallback;
}

export async function focusEmitirNfse(
  baseUrl: string,
  token: string,
  ref: string,
  body: FocusNfseEmitirBody,
): Promise<FocusNfseRespostaEmitir> {
  const url = `${baseUrl.replace(/\/$/, "")}/nfse?ref=${encodeURIComponent(ref)}`;
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
      mensagemErro(json, `Focus NFe retornou HTTP ${res.status}.`),
      res.status,
      json,
    );
  }
  return json as FocusNfseRespostaEmitir;
}

export async function focusConsultarNfse(
  baseUrl: string,
  token: string,
  ref: string,
): Promise<FocusNfseRespostaConsulta> {
  const url = `${baseUrl.replace(/\/$/, "")}/nfse/${encodeURIComponent(ref)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: authHeader(token),
    },
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new FocusNfeApiError(
      mensagemErro(json, `Focus NFe retornou HTTP ${res.status}.`),
      res.status,
      json,
    );
  }
  return json as FocusNfseRespostaConsulta;
}

export async function focusCancelarNfse(
  baseUrl: string,
  token: string,
  ref: string,
): Promise<FocusNfseRespostaCancelar> {
  const url = `${baseUrl.replace(/\/$/, "")}/nfse/${encodeURIComponent(ref)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      accept: "application/json",
      authorization: authHeader(token),
      "content-type": "application/json",
    },
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new FocusNfeApiError(
      mensagemErro(json, `Focus NFe retornou HTTP ${res.status}.`),
      res.status,
      json,
    );
  }
  return json as FocusNfseRespostaCancelar;
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
