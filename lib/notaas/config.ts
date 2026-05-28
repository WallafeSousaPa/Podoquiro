import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CNAE_PADRAO_BELEM,
  CODIGO_SERVICO_PODOLOGIA,
  normalizarCodigoServicoLc116,
  normalizarCnae,
} from "./codigo-servico";
import { decifrarSenhaUtf8, deriveMasterKeyFromEnv } from "@/lib/sefaz/nfe/cert-crypto";

const NOTAAS_BASE_URL =
  process.env.NOTAAS_BASE_URL?.trim() || "https://platform.notaas.com.br/api/v1";

export function getNotaasBaseUrl(): string {
  return NOTAAS_BASE_URL.replace(/\/$/, "");
}

function apiKeyFromEnv(): string | null {
  const k = process.env.NOTAAS_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

/**
 * API Key: prioridade empresa (cifrada no banco) → variável NOTAAS_API_KEY.
 */
export async function obterApiKeyNotaas(
  supabase: SupabaseClient,
  idEmpresa: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("empresa_notaas_config")
    .select("api_key_cifrada")
    .eq("id_empresa", idEmpresa)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (data?.api_key_cifrada) {
    try {
      const masterKey = deriveMasterKeyFromEnv();
      return decifrarSenhaUtf8(data.api_key_cifrada as string, masterKey);
    } catch {
      throw new Error("NOTAAS_API_KEY_CIFRADA_INVALIDA");
    }
  }

  return apiKeyFromEnv();
}

export type ConfigEmissaoNotaas = {
  codigoServico: string;
  cnae: string | null;
  aliquotaIss: number;
  issRetido: boolean;
};

export async function obterConfigEmissaoNotaas(
  supabase: SupabaseClient,
  idEmpresa: number,
): Promise<ConfigEmissaoNotaas> {
  const { data, error } = await supabase
    .from("empresa_notaas_config")
    .select("codigo_servico_padrao, cnae_padrao, aliquota_iss_padrao, iss_retido_padrao")
    .eq("id_empresa", idEmpresa)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const codigoEnv = process.env.NOTAAS_CODIGO_SERVICO?.trim() || CODIGO_SERVICO_PODOLOGIA;
  const cnaeEnv = process.env.NOTAAS_CNAE?.trim() || CNAE_PADRAO_BELEM;
  const aliqEnv = process.env.NOTAAS_ALIQUOTA_ISS?.trim();
  const aliqParsed = aliqEnv ? Number(aliqEnv.replace(",", ".")) : NaN;

  const aliquotaDb = data?.aliquota_iss_padrao != null ? Number(data.aliquota_iss_padrao) : NaN;

  const codigoRaw =
    (data?.codigo_servico_padrao as string | null)?.trim() || codigoEnv;
  const codigoServico =
    normalizarCodigoServicoLc116(codigoRaw) ?? CODIGO_SERVICO_PODOLOGIA;

  const cnaeRaw = (data?.cnae_padrao as string | null)?.trim() || cnaeEnv;
  const cnae = normalizarCnae(cnaeRaw);

  return {
    codigoServico,
    cnae,
    aliquotaIss: Number.isFinite(aliquotaDb) ? aliquotaDb : Number.isFinite(aliqParsed) ? aliqParsed : 2,
    issRetido: Boolean(data?.iss_retido_padrao),
  };
}
