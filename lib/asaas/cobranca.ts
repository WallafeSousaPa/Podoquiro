import type { AsaasConfig } from "./config";
import { expiraEmFromEndDate, statusInternoTaxaFromAsaas } from "./payment-link";

export type { AsaasPagamentoDetalhe } from "./payment-link";
export { statusInternoTaxaFromAsaas, expiraEmFromEndDate };

export type AsaasCriarCobrancaInput = {
  customerId: string;
  valorReais: number;
  descricao: string;
  /** Dias até o vencimento (dueDate). */
  diasExpiracao?: number;
  externalReference?: string;
};

export type AsaasCobrancaCriada = {
  paymentId: string;
  invoiceUrl: string;
  dueDate: string | null;
  respostaBruta: unknown;
};

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function headersAsaas(config: AsaasConfig): HeadersInit {
  return {
    access_token: config.apiKey,
    accept: "application/json",
    "content-type": "application/json",
    "User-Agent": config.userAgent,
  };
}

function mensagemErro(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o.errors) && o.errors.length) {
      const first = o.errors[0] as Record<string, unknown>;
      const desc = typeof first?.description === "string" ? first.description : null;
      if (desc) return desc;
    }
    const msg = typeof o.message === "string" ? o.message : null;
    if (msg) return msg;
  }
  return `Asaas retornou HTTP ${status}.`;
}

function formatDateIso(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/**
 * Cria cobrança vinculada a um cliente já cadastrado — POST /v3/payments.
 * Retorna invoiceUrl (checkout sem pedir cadastro do pagador).
 */
export async function criarCobrancaAsaas(
  config: AsaasConfig,
  input: AsaasCriarCobrancaInput,
): Promise<AsaasCobrancaCriada> {
  const valor = Math.round(input.valorReais * 100) / 100;
  if (!Number.isFinite(valor) || valor < 1) {
    throw new Error("Valor mínimo R$ 1,00.");
  }

  const customerId = input.customerId.trim();
  if (!customerId) {
    throw new Error("Cliente Asaas inválido.");
  }

  const descricao = input.descricao.trim().slice(0, 500);
  if (!descricao) {
    throw new Error("Descrição da cobrança é obrigatória.");
  }

  const dias = Math.min(Math.max(input.diasExpiracao ?? 7, 1), 60);
  const due = new Date();
  due.setDate(due.getDate() + dias);
  const dueDate = formatDateIso(due);

  const payload: Record<string, unknown> = {
    customer: customerId,
    billingType: "UNDEFINED",
    value: valor,
    dueDate,
    description: descricao,
    notificationDisabled: true,
  };
  if (input.externalReference) {
    payload.externalReference = input.externalReference;
  }

  const url = `${config.baseUrl}/v3/payments`;
  const res = await fetch(url, {
    method: "POST",
    headers: headersAsaas(config),
    body: JSON.stringify(payload),
  });

  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(mensagemErro(body, res.status));
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const paymentId = pickString(o, "id");
  const invoiceUrl = pickString(o, "invoiceUrl", "invoice_url");
  if (!paymentId || !invoiceUrl) {
    throw new Error("Asaas não retornou id ou invoiceUrl da cobrança.");
  }

  return {
    paymentId,
    invoiceUrl,
    dueDate: pickString(o, "dueDate", "due_date") ?? dueDate,
    respostaBruta: body,
  };
}

/** GET /v3/payments/{id} */
export async function consultarPagamentoAsaasPorId(
  config: AsaasConfig,
  paymentId: string,
): Promise<{
  paymentId: string | null;
  statusPagamento: string | null;
  billingType: string | null;
  respostaBruta: unknown;
}> {
  const id = paymentId.trim();
  if (!id) {
    return { paymentId: null, statusPagamento: null, billingType: null, respostaBruta: {} };
  }

  const url = `${config.baseUrl}/v3/payments/${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: "GET", headers: headersAsaas(config) });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(mensagemErro(body, res.status));
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    paymentId: pickString(o, "id"),
    statusPagamento: pickString(o, "status"),
    billingType: pickString(o, "billingType", "billing_type"),
    respostaBruta: body,
  };
}
