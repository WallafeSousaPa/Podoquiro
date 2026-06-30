import type { RedeConfig } from "./config";
import { obterAccessTokenRede } from "./oauth";

/** IDs fixos do manual do simulador — consulta de cenários, não links criados de verdade. */
const LINK_IDS_EXEMPLO_DOC_SANDBOX = new Set([
  "33j36w0",
  "mw3cpls",
  "dccef8g",
  "hut23ay",
  "cqf5kab",
  "ooysgb1",
]);

function validarRespostaCriacaoLink(config: RedeConfig, paymentLinkId: string): void {
  if (config.ambiente !== "sandbox") return;
  if (!LINK_IDS_EXEMPLO_DOC_SANDBOX.has(paymentLinkId)) return;

  throw new Error(
    "A Rede retornou um link de exemplo da documentação do simulador (não um link real). " +
      "Isso ocorre quando o PV da maquininha (produção) é usado com credenciais de sandbox do Developer Portal. " +
      "Para testar: use o PV de teste do projeto no developer.userede.com.br. " +
      "Para links reais com PV da maquininha: solicite credenciais de produção (REDE_AMBIENTE=producao) " +
      "e habilite o Link de Pagamento no portal www.userede.com.br.",
  );
}

export type RedeCriarPaymentLinkInput = {
  valorReais: number;
  descricao: string;
  /** Dias até expirar (máx. 15). */
  diasExpiracao?: number;
  parcelas?: number;
  paymentOptions?: ("pix" | "credit")[];
  createdBy?: string;
  comentarios?: string;
};

export type RedePaymentLinkCriado = {
  paymentLinkId: string;
  url: string;
  message: string | null;
  respostaBruta: unknown;
};

export type RedePaymentLinkDetalhe = {
  paymentLinkId: string | null;
  statusRede: string | null;
  url: string | null;
  amount: number | null;
  expirationDate: string | null;
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

/**
 * A API sandbox retorna `sandbox.userede.com.br`, domínio inexistente no DNS.
 * O checkout funciona em www.userede.com.br/pagamentos/pt/{id}.
 */
export function normalizarUrlCheckoutPaymentLinkRede(
  url: string | null | undefined,
  config: RedeConfig,
): string | null {
  const raw = url?.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const origin = config.paymentLinkCheckoutOrigin.replace(/\/$/, "");

    if (config.ambiente === "sandbox") {
      const host = parsed.hostname.toLowerCase();
      if (host === "sandbox.userede.com.br" || host.endsWith(".sandbox.userede.com.br")) {
        return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
      }
    }

    return raw;
  } catch {
    return raw;
  }
}

function mensagemErro(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const msg =
      (typeof o.message === "string" && o.message) ||
      (typeof o.returnMessage === "string" && o.returnMessage) ||
      (typeof o.error === "string" && o.error);
    if (msg) return msg;
  }
  return `Link de Pagamento Rede retornou HTTP ${status}.`;
}

function headersPagamento(config: RedeConfig, token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/json",
    "content-type": "application/json",
    "company-number": config.merchantId.replace(/\D/g, ""),
  };
}

/** MM/DD/YYYY (formato exigido pela API). */
export function formatExpirationDatePaymentLink(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  return `${m}/${d}/${y}`;
}

function parseExpirationToIso(mmDdYyyy: string | null): string | null {
  if (!mmDdYyyy?.trim()) return null;
  const m = mmDdYyyy.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T23:59:59-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Cria link de pagamento — POST /payment-link/v1/create
 * Documentação: Link de Pagamento Rede (developer.userede.com.br)
 */
export async function criarLinkPagamentoRede(
  config: RedeConfig,
  input: RedeCriarPaymentLinkInput,
): Promise<RedePaymentLinkCriado> {
  const valor = Math.round(input.valorReais * 100) / 100;
  if (!Number.isFinite(valor) || valor < 1) {
    throw new Error("Valor mínimo R$ 1,00 (simulador Rede).");
  }
  if (valor >= 20_000 && config.ambiente === "sandbox") {
    throw new Error("Valor máximo R$ 19.999,99 no simulador Rede.");
  }

  const dias = Math.min(Math.max(input.diasExpiracao ?? 7, 1), 15);
  const expira = new Date();
  expira.setDate(expira.getDate() + dias);

  const descricao = input.descricao.trim().slice(0, 50);
  if (!descricao) {
    throw new Error("Descrição do link é obrigatória (até 50 caracteres).");
  }

  const token = await obterAccessTokenRede(config);
  const url = `${config.paymentLinkBaseUrl.replace(/\/$/, "")}/v1/create`;
  const payload = {
    amount: valor,
    expirationDate: formatExpirationDatePaymentLink(expira),
    installments: Math.min(Math.max(input.parcelas ?? 1, 1), 12),
    createdBy: input.createdBy?.trim() || config.paymentLinkCreatedBy,
    paymentOptions: input.paymentOptions?.length ? input.paymentOptions : ["pix", "credit"],
    description: descricao,
    comments: (input.comentarios ?? descricao).trim().slice(0, 200),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: headersPagamento(config, token),
    body: JSON.stringify(payload),
  });

  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(mensagemErro(body, res.status));
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const paymentLinkId = pickString(o, "paymentLinkId", "payment_link_id");
  const linkUrlRaw = pickString(o, "url");
  const linkUrl = normalizarUrlCheckoutPaymentLinkRede(linkUrlRaw, config);
  if (!paymentLinkId || !linkUrl) {
    throw new Error("Rede não retornou paymentLinkId ou url do link de pagamento.");
  }

  validarRespostaCriacaoLink(config, paymentLinkId);

  return {
    paymentLinkId,
    url: linkUrl,
    message: pickString(o, "message"),
    respostaBruta: body,
  };
}

/** GET /payment-link/v1/details/{paymentLinkId} */
export async function consultarLinkPagamentoRede(
  config: RedeConfig,
  paymentLinkId: string,
): Promise<RedePaymentLinkDetalhe> {
  const token = await obterAccessTokenRede(config);
  const url = `${config.paymentLinkBaseUrl.replace(/\/$/, "")}/v1/details/${encodeURIComponent(paymentLinkId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: headersPagamento(config, token),
  });

  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(mensagemErro(body, res.status));
  }

  const raiz = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const order =
    raiz.Order && typeof raiz.Order === "object"
      ? (raiz.Order as Record<string, unknown>)
      : raiz.order && typeof raiz.order === "object"
        ? (raiz.order as Record<string, unknown>)
        : null;

  const statusRede = pickString(order ?? {}, "status");
  const linkUrl = normalizarUrlCheckoutPaymentLinkRede(pickString(order ?? {}, "url"), config);
  const paymentLinkIdResp = pickString(order ?? {}, "paymentLinkId", "payment_link_id");
  const expirationDate = pickString(order ?? {}, "expirationDate", "expiration_date");

  const amountRaw = order?.amount;
  let amount: number | null = null;
  if (typeof amountRaw === "number") {
    amount = amountRaw >= 100 ? amountRaw / 100 : amountRaw;
  }

  return {
    paymentLinkId: paymentLinkIdResp ?? paymentLinkId,
    statusRede,
    url: linkUrl,
    amount,
    expirationDate,
    respostaBruta: body,
  };
}

export function expiraEmFromPaymentLink(expirationDate: string | null): string | null {
  return parseExpirationToIso(expirationDate);
}

/** Mapeia status Rede → status interno da taxa. */
export function statusInternoTaxaFromRede(statusRede: string | null): {
  status: "pendente" | "pago" | "cancelado" | "expirado" | null;
  confirmarAgendamento: boolean;
} {
  const s = (statusRede ?? "").toUpperCase();
  if (s === "PAID") return { status: "pago", confirmarAgendamento: true };
  if (s === "CREATED") return { status: "pendente", confirmarAgendamento: false };
  if (s === "CANCELED" || s === "CANCELLED") return { status: "cancelado", confirmarAgendamento: false };
  if (s === "REJECTED" || s === "REVERSED") return { status: "cancelado", confirmarAgendamento: false };
  return { status: null, confirmarAgendamento: false };
}
