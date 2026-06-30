export type RedeAmbiente = "sandbox" | "producao";

export type RedeConfig = {
  ambiente: RedeAmbiente;
  clientId: string;
  clientSecret: string;
  merchantId: string;
  oauthUrl: string;
  paymentLinkBaseUrl: string;
  paymentLinkCreatedBy: string;
  /** Origem do checkout (URL compartilhada com o paciente). */
  paymentLinkCheckoutOrigin: string;
  /** Legado e.Rede Pix — mantido para rotas de webhook antigas. */
  transactionsBaseUrl: string;
};

/** OAuth — Link de Pagamento usa /oauth/token no simulador. */
const OAUTH_URL: Record<RedeAmbiente, string> = {
  sandbox: "https://rl7-sandbox-api.useredecloud.com.br/oauth/token",
  producao: "https://api.userede.com.br/redelabs/oauth2/token",
};

const PAYMENT_LINK_BASE_URL: Record<RedeAmbiente, string> = {
  sandbox: "https://payments-apisandbox.useredecloud.com.br/payment-link",
  producao: "https://payments-api.useredecloud.com.br/payment-link",
};

const TRANSACTIONS_BASE_URL: Record<RedeAmbiente, string> = {
  sandbox: "https://sandbox-erede.useredecloud.com.br",
  producao: "https://api.userede.com.br/erede",
};

/** Checkout público — a API sandbox devolve sandbox.userede.com.br (sem DNS). */
const PAYMENT_LINK_CHECKOUT_ORIGIN: Record<RedeAmbiente, string> = {
  sandbox: "https://www.userede.com.br",
  producao: "https://www.userede.com.br",
};

function parseAmbiente(raw: string | undefined): RedeAmbiente {
  const v = (raw ?? "sandbox").trim().toLowerCase();
  return v === "producao" || v === "production" ? "producao" : "sandbox";
}

/** Credenciais Rede (OAuth + PV) — variáveis de ambiente no servidor. */
export function obterConfigRede(): RedeConfig | null {
  const clientId = process.env.REDE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.REDE_CLIENT_SECRET?.trim() ?? "";
  const merchantId = process.env.REDE_MERCHANT_ID?.trim() ?? "";
  if (!clientId || !clientSecret || !merchantId) return null;

  const ambiente = parseAmbiente(process.env.REDE_AMBIENTE);
  const createdBy =
    process.env.REDE_PAYMENT_LINK_CREATED_BY?.trim() ||
    process.env.REDE_CREATED_BY?.trim() ||
    "integracao@podquiro.local";

  return {
    ambiente,
    clientId,
    clientSecret,
    merchantId,
    oauthUrl: process.env.REDE_OAUTH_URL?.trim() || OAUTH_URL[ambiente],
    paymentLinkBaseUrl:
      process.env.REDE_PAYMENT_LINK_BASE_URL?.trim().replace(/\/$/, "") ||
      PAYMENT_LINK_BASE_URL[ambiente],
    paymentLinkCreatedBy: createdBy,
    paymentLinkCheckoutOrigin:
      process.env.REDE_PAYMENT_LINK_CHECKOUT_ORIGIN?.trim().replace(/\/$/, "") ||
      PAYMENT_LINK_CHECKOUT_ORIGIN[ambiente],
    transactionsBaseUrl:
      process.env.REDE_TRANSACTIONS_BASE_URL?.trim().replace(/\/$/, "") ||
      TRANSACTIONS_BASE_URL[ambiente],
  };
}

export function redeConfigurada(): boolean {
  return obterConfigRede() !== null;
}
