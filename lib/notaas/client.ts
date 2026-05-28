import { getNotaasBaseUrl } from "./config";
import type {
  NotaasCancelarBody,
  NotaasEmitirBody,
  NotaasEmitirResponse,
  NotaasInvoiceStatus,
} from "./types";

export class NotaasApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "NotaasApiError";
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function mensagemErro(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    if (typeof o.error === "string" && o.error.trim()) return o.error;
  }
  return fallback;
}

export async function notaasEmitir(
  apiKey: string,
  body: NotaasEmitirBody,
): Promise<NotaasEmitirResponse> {
  const res = await fetch(`${getNotaasBaseUrl()}/emitir`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const json = await parseJsonSafe(res);
  if (!res.ok) {
    throw new NotaasApiError(
      mensagemErro(json, `Falha ao enfileirar NFS-e (${res.status}).`),
      res.status,
      json,
    );
  }
  return json as NotaasEmitirResponse;
}

export async function notaasConsultarStatus(
  apiKey: string,
  invoiceId: string,
): Promise<NotaasInvoiceStatus> {
  const res = await fetch(
    `${getNotaasBaseUrl()}/invoices/${encodeURIComponent(invoiceId)}/status`,
    {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    },
  );
  const json = await parseJsonSafe(res);
  if (!res.ok) {
    throw new NotaasApiError(
      mensagemErro(json, `Falha ao consultar status (${res.status}).`),
      res.status,
      json,
    );
  }
  return json as NotaasInvoiceStatus;
}

export async function notaasCancelar(
  apiKey: string,
  body: NotaasCancelarBody,
): Promise<unknown> {
  const res = await fetch(`${getNotaasBaseUrl()}/cancelar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const json = await parseJsonSafe(res);
  if (!res.ok) {
    throw new NotaasApiError(
      mensagemErro(json, `Falha ao solicitar cancelamento (${res.status}).`),
      res.status,
      json,
    );
  }
  return json;
}
