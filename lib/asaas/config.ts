export type AsaasAmbiente = "sandbox" | "producao";

export type AsaasConfig = {
  ambiente: AsaasAmbiente;
  apiKey: string;
  baseUrl: string;
  userAgent: string;
  /** Token opcional para validar o webhook (header asaas-access-token). */
  webhookToken: string | null;
};

const BASE_URL: Record<AsaasAmbiente, string> = {
  sandbox: "https://api-sandbox.asaas.com",
  producao: "https://api.asaas.com",
};

function parseAmbiente(raw: string | undefined): AsaasAmbiente {
  const v = (raw ?? "sandbox").trim().toLowerCase();
  return v === "producao" || v === "production" ? "producao" : "sandbox";
}

/** Credenciais Asaas (API Key) — variáveis de ambiente no servidor. */
export function obterConfigAsaas(): AsaasConfig | null {
  const apiKey = process.env.ASAAS_API_KEY?.trim() ?? "";
  if (!apiKey) return null;

  const ambiente = parseAmbiente(process.env.ASAAS_AMBIENTE);

  return {
    ambiente,
    apiKey,
    baseUrl: process.env.ASAAS_BASE_URL?.trim().replace(/\/$/, "") || BASE_URL[ambiente],
    userAgent: process.env.ASAAS_USER_AGENT?.trim() || "Podoquiro/1.0.0",
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN?.trim() || null,
  };
}

export function asaasConfigurado(): boolean {
  return obterConfigAsaas() !== null;
}
