import type { AsaasConfig } from "./config";

export type AsaasCriarPaymentLinkInput = {
  valorReais: number;
  /** Nome do link (aparece no checkout). */
  nome: string;
  descricao?: string;
  /** Dias até expirar (define endDate e dueDateLimitDays do boleto). */
  diasExpiracao?: number;
  parcelas?: number;
  externalReference?: string;
  /** Formas de pagamento aceitas. UNDEFINED = todas (Pix, cartão, boleto). */
  billingType?: "UNDEFINED" | "PIX" | "CREDIT_CARD" | "BOLETO";
};

export type AsaasPaymentLinkCriado = {
  paymentLinkId: string;
  url: string;
  endDate: string | null;
  respostaBruta: unknown;
};

export type AsaasPagamentoDetalhe = {
  paymentId: string | null;
  statusPagamento: string | null;
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

/** Data no formato YYYY-MM-DD (America/Sao_Paulo). */
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

/** endDate (YYYY-MM-DD) → ISO no fim do dia (America/Sao_Paulo). */
export function expiraEmFromEndDate(endDate: string | null): string | null {
  if (!endDate?.trim()) return null;
  const m = endDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, yyyy, mm, dd] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T23:59:59-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Cria link de pagamento — POST /v3/paymentLinks
 * Documentação: https://docs.asaas.com/reference/create-a-payments-link
 */
export async function criarLinkPagamentoAsaas(
  config: AsaasConfig,
  input: AsaasCriarPaymentLinkInput,
): Promise<AsaasPaymentLinkCriado> {
  const valor = Math.round(input.valorReais * 100) / 100;
  if (!Number.isFinite(valor) || valor < 1) {
    throw new Error("Valor mínimo R$ 1,00.");
  }

  const nome = input.nome.trim().slice(0, 100);
  if (!nome) {
    throw new Error("Nome do link é obrigatório.");
  }

  const dias = Math.min(Math.max(input.diasExpiracao ?? 7, 1), 60);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + dias);

  const parcelas = Math.min(Math.max(input.parcelas ?? 1, 1), 12);
  const chargeType = parcelas > 1 ? "INSTALLMENT" : "DETACHED";

  const payload: Record<string, unknown> = {
    name: nome,
    description: (input.descricao ?? nome).trim().slice(0, 500),
    value: valor,
    billingType: input.billingType ?? "UNDEFINED",
    chargeType,
    dueDateLimitDays: Math.min(dias, 60),
    endDate: formatDateIso(endDate),
    notificationEnabled: false,
  };
  if (chargeType === "INSTALLMENT") payload.maxInstallmentCount = parcelas;
  if (input.externalReference) payload.externalReference = input.externalReference;

  const url = `${config.baseUrl}/v3/paymentLinks`;
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
  const paymentLinkId = pickString(o, "id");
  const linkUrl = pickString(o, "url");
  if (!paymentLinkId || !linkUrl) {
    throw new Error("Asaas não retornou id ou url do link de pagamento.");
  }

  return {
    paymentLinkId,
    url: linkUrl,
    endDate: pickString(o, "endDate"),
    respostaBruta: body,
  };
}

const STATUS_PAGO = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

/**
 * Consulta as cobranças geradas por um link e retorna a mais relevante.
 * GET /v3/payments (filtra pelo campo paymentLink da cobrança).
 */
export async function consultarPagamentoDoLinkAsaas(
  config: AsaasConfig,
  paymentLinkId: string,
): Promise<AsaasPagamentoDetalhe> {
  const url = `${config.baseUrl}/v3/payments?paymentLink=${encodeURIComponent(paymentLinkId)}&limit=100`;
  const res = await fetch(url, {
    method: "GET",
    headers: headersAsaas(config),
  });

  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(mensagemErro(body, res.status));
  }

  const raiz = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const dataRaw = Array.isArray(raiz.data) ? (raiz.data as Record<string, unknown>[]) : [];
  // Filtra client-side: o parâmetro paymentLink pode não ser aplicado pela API.
  const cobrancas = dataRaw.filter((p) => pickString(p, "paymentLink") === paymentLinkId);

  const pago = cobrancas.find((p) => STATUS_PAGO.has((pickString(p, "status") ?? "").toUpperCase()));
  const escolhida = pago ?? cobrancas[0] ?? null;

  return {
    paymentId: escolhida ? pickString(escolhida, "id") : null,
    statusPagamento: escolhida ? pickString(escolhida, "status") : null,
    respostaBruta: body,
  };
}

/** Mapeia status da cobrança Asaas → status interno da taxa. */
export function statusInternoTaxaFromAsaas(statusPagamento: string | null): {
  status: "pendente" | "pago" | "cancelado" | "expirado" | null;
  confirmarAgendamento: boolean;
} {
  const s = (statusPagamento ?? "").toUpperCase();
  if (STATUS_PAGO.has(s)) return { status: "pago", confirmarAgendamento: true };
  if (s === "PENDING" || s === "OVERDUE" || s === "AWAITING_RISK_ANALYSIS") {
    return { status: "pendente", confirmarAgendamento: false };
  }
  if (
    s === "REFUNDED" ||
    s === "REFUND_REQUESTED" ||
    s === "REFUND_IN_PROGRESS" ||
    s === "CHARGEBACK_REQUESTED" ||
    s === "CHARGEBACK_DISPUTE"
  ) {
    return { status: "cancelado", confirmarAgendamento: false };
  }
  return { status: null, confirmarAgendamento: false };
}
