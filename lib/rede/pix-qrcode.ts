import type { RedeConfig } from "./config";
import { obterAccessTokenRede } from "./oauth";

export type RedeGerarPixInput = {
  valorReais: number;
  referencia: string;
  /** Validade do QR Pix (padrão 24h; máx. 15 dias na Rede). */
  expiracaoHoras?: number;
};

export type RedeGerarPixResultado = {
  qrcodeBase64: string | null;
  codigoPagamento: string | null;
  tid: string | null;
  referencia: string;
  expiraEm: string | null;
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

/** Referência alfanumérica até 16 caracteres (limite e.Rede Pix). */
export function normalizarReferenciaPixRede(referencia: string, idAgendamento?: number): string {
  const limpa = referencia.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  if (limpa.length >= 4) return limpa;
  const fallback = `ag${idAgendamento ?? 0}${String(Date.now() % 1_000_000).padStart(6, "0")}`;
  return fallback.slice(0, 16);
}

function formatExpirationBrasilia(date: Date): string {
  return date
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .replace(" ", "T");
}

function valorEmCentavos(valorReais: number): number {
  return Math.round(valorReais * 100);
}

function extrairResultadoPix(referencia: string, body: unknown): RedeGerarPixResultado {
  const raiz = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const qr =
    raiz.qrCodeResponse && typeof raiz.qrCodeResponse === "object"
      ? (raiz.qrCodeResponse as Record<string, unknown>)
      : raiz;

  const qrcodeBase64 = pickString(qr, "qrCodeImage", "qr_code_image", "qrcode_base64");
  const codigoPagamento = pickString(qr, "qrCodeData", "qr_code_data", "qrcode");
  const tid = pickString(raiz, "tid", "transactionId", "transaction_id");
  const expiraEm = pickString(
    qr,
    "dateTimeExpiration",
    "datetimeExpiration",
    "expirationQrCode",
    "expiration_qr_code",
  );

  return {
    qrcodeBase64,
    codigoPagamento,
    tid,
    referencia: pickString(raiz, "reference") ?? referencia,
    expiraEm,
    respostaBruta: body,
  };
}

function mensagemErroPix(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const msg =
      (typeof o.returnMessage === "string" && o.returnMessage) ||
      (typeof o.message === "string" && o.message) ||
      (typeof o.error === "string" && o.error);
    if (msg) return msg;
  }
  return `Rede Pix retornou HTTP ${status}.`;
}

/**
 * Gera QR Code Pix via e.Rede `POST /v2/transactions`.
 * Documentação: https://developer.userede.com.br/e-rede
 */
export async function gerarPixQrCodeRede(
  config: RedeConfig,
  input: RedeGerarPixInput,
): Promise<RedeGerarPixResultado> {
  const token = await obterAccessTokenRede(config);
  const valor = Math.round(input.valorReais * 100) / 100;
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error("Valor da transação inválido.");
  }

  const referencia = normalizarReferenciaPixRede(input.referencia);
  const horas = Math.min(Math.max(input.expiracaoHoras ?? 24, 1), 15 * 24);
  const expira = new Date(Date.now() + horas * 60 * 60 * 1000);
  const dateTimeExpiration = formatExpirationBrasilia(expira);

  const url = `${config.transactionsBaseUrl.replace(/\/$/, "")}/v2/transactions`;
  const payload = {
    kind: "pix",
    reference: referencia,
    amount: valorEmCentavos(valor),
    qrCode: {
      dateTimeExpiration,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(mensagemErroPix(body, res.status));
  }

  const raiz = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const returnCode = pickString(raiz, "returnCode", "return_code");
  if (returnCode && returnCode !== "00") {
    throw new Error(
      pickString(raiz, "returnMessage", "return_message") ??
        `Rede Pix recusou a transação (código ${returnCode}).`,
    );
  }

  const resultado = extrairResultadoPix(referencia, body);
  if (!resultado.qrcodeBase64 && !resultado.codigoPagamento) {
    throw new Error(
      "Rede não retornou QR Code Pix. Verifique credenciais, chave Pix habilitada e ambiente.",
    );
  }
  if (!resultado.tid) {
    throw new Error("Rede não retornou TID da transação Pix.");
  }

  return {
    ...resultado,
    expiraEm: resultado.expiraEm ?? expira.toISOString(),
  };
}

/** @deprecated Use gerarPixQrCodeRede — alias mantido para compatibilidade interna. */
export type RedeGerarQrCodeInput = RedeGerarPixInput;
/** @deprecated Use RedeGerarPixResultado */
export type RedeGerarQrCodeResultado = RedeGerarPixResultado;

/** Alias: gera QR Code Pix e.Rede (substitui API legada /qrcode/v1). */
export const gerarQrCodePagamentoRede = gerarPixQrCodeRede;
