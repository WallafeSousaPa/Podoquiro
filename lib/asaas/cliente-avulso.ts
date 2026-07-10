import type { AsaasConfig } from "./config";

let clienteAvulsoIdCache: string | null = null;

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

function headersAsaas(config: AsaasConfig): HeadersInit {
  return {
    access_token: config.apiKey,
    accept: "application/json",
    "content-type": "application/json",
    "User-Agent": config.userAgent,
  };
}

export function normalizeCpfAsaas(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== "string") return "";
  return raw.replace(/\D/g, "");
}

/** Valida CPF (11 dígitos + dígitos verificadores). */
export function cpfValidoAsaas(cpf: string | null | undefined): boolean {
  const digits = normalizeCpfAsaas(cpf);
  if (!/^\d{11}$/.test(digits)) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(digits[10]);
}

function obterCpfClienteAvulsoEnv(): string {
  const cpf = normalizeCpfAsaas(process.env.ASAAS_CLIENTE_AVULSO_CPF);
  if (!cpfValidoAsaas(cpf)) {
    throw new Error(
      "Configure ASAAS_CLIENTE_AVULSO_CPF com um CPF válido (11 dígitos) no servidor.",
    );
  }
  return cpf;
}

function obterNomeClienteAvulsoEnv(): string {
  const nome = process.env.ASAAS_CLIENTE_AVULSO_NOME?.trim();
  return nome || "Cliente Avulso Podoquiro";
}

async function buscarClientePorCpf(
  config: AsaasConfig,
  cpf: string,
): Promise<string | null> {
  const url = `${config.baseUrl}/v3/customers?cpfCnpj=${encodeURIComponent(cpf)}&limit=1`;
  const res = await fetch(url, { method: "GET", headers: headersAsaas(config) });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(mensagemErro(body, res.status));
  }

  const raiz = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const data = Array.isArray(raiz.data) ? (raiz.data as Record<string, unknown>[]) : [];
  const primeiro = data[0];
  return primeiro ? pickString(primeiro, "id") : null;
}

async function criarClienteAvulso(
  config: AsaasConfig,
  cpf: string,
  nome: string,
): Promise<string> {
  const url = `${config.baseUrl}/v3/customers`;
  const res = await fetch(url, {
    method: "POST",
    headers: headersAsaas(config),
    body: JSON.stringify({
      name: nome.slice(0, 100),
      cpfCnpj: cpf,
      notificationDisabled: true,
    }),
  });

  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(mensagemErro(body, res.status));
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const id = pickString(o, "id");
  if (!id) {
    throw new Error("Asaas não retornou o id do cliente avulso.");
  }
  return id;
}

/**
 * Cliente genérico usado em todas as cobranças de taxa de agendamento.
 * Pode ser informado via ASAAS_CLIENTE_AVULSO_ID ou criado/buscado pelo CPF (ASAAS_CLIENTE_AVULSO_CPF).
 */
export async function obterOuCriarClienteAvulsoAsaas(config: AsaasConfig): Promise<string> {
  const idEnv = process.env.ASAAS_CLIENTE_AVULSO_ID?.trim();
  if (idEnv) return idEnv;

  if (clienteAvulsoIdCache) return clienteAvulsoIdCache;

  const cpf = obterCpfClienteAvulsoEnv();
  const nome = obterNomeClienteAvulsoEnv();

  const existente = await buscarClientePorCpf(config, cpf);
  if (existente) {
    clienteAvulsoIdCache = existente;
    return existente;
  }

  const criado = await criarClienteAvulso(config, cpf, nome);
  clienteAvulsoIdCache = criado;
  return criado;
}

/** Limpa cache em memória (útil em testes). */
export function limparCacheClienteAvulsoAsaas(): void {
  clienteAvulsoIdCache = null;
}
