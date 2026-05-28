import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CNAE_PADRAO_BELEM,
  CODIGO_SERVICO_PODOLOGIA,
  normalizarCnae,
  normalizarCodigoServicoLc116,
} from "@/lib/notaas/codigo-servico";
import { decifrarSenhaUtf8, deriveMasterKeyFromEnv } from "@/lib/sefaz/nfe/cert-crypto";
import { baseUrlFocusNfe } from "./urls";
import type { FocusAmbiente } from "./types";

export type ConfigFocusNfeEmpresa = {
  ambiente: FocusAmbiente;
  baseUrl: string;
  prestadorCnpj: string;
  prestadorInscricaoMunicipal: string;
  prestadorCodigoMunicipio: string;
  itemListaServico: string;
  codigoCnae: string;
  naturezaOperacao: string;
  regimeEspecialTributacao: string | null;
  optanteSimplesNacional: boolean;
  issRetidoPadrao: boolean;
};

function tokenFromEnv(): string | null {
  const k = process.env.FOCUSNFE_TOKEN?.trim();
  return k && k.length > 0 ? k : null;
}

export async function obterTokenFocusNfe(
  supabase: SupabaseClient,
  idEmpresa: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("empresa_focusnfe_config")
    .select("token_cifrado")
    .eq("id_empresa", idEmpresa)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (data?.token_cifrado) {
    try {
      const masterKey = deriveMasterKeyFromEnv();
      return decifrarSenhaUtf8(data.token_cifrado as string, masterKey);
    } catch {
      throw new Error("FOCUSNFE_TOKEN_CIFRADO_INVALIDO");
    }
  }

  return tokenFromEnv();
}

export async function obterConfigFocusNfe(
  supabase: SupabaseClient,
  idEmpresa: number,
): Promise<ConfigFocusNfeEmpresa | null> {
  const { data, error } = await supabase
    .from("empresa_focusnfe_config")
    .select(
      "ambiente, prestador_cnpj, prestador_inscricao_municipal, prestador_codigo_municipio, item_lista_servico, codigo_cnae, natureza_operacao, regime_especial_tributacao, optante_simples_nacional, iss_retido_padrao",
    )
    .eq("id_empresa", idEmpresa)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const ambiente =
    data.ambiente === "producao" ? "producao" : ("homologacao" as FocusAmbiente);

  const itemRaw = (data.item_lista_servico as string | null)?.trim() || CODIGO_SERVICO_PODOLOGIA;
  const cnaeRaw = (data.codigo_cnae as string | null)?.trim() || CNAE_PADRAO_BELEM;

  return {
    ambiente,
    baseUrl: baseUrlFocusNfe(ambiente),
    prestadorCnpj: String(data.prestador_cnpj ?? "").replace(/\D/g, ""),
    prestadorInscricaoMunicipal: String(data.prestador_inscricao_municipal ?? "").trim(),
    prestadorCodigoMunicipio: String(data.prestador_codigo_municipio ?? "1501402").replace(
      /\D/g,
      "",
    ),
    itemListaServico:
      normalizarCodigoServicoLc116(itemRaw) ?? CODIGO_SERVICO_PODOLOGIA,
    codigoCnae: normalizarCnae(cnaeRaw) ?? CNAE_PADRAO_BELEM,
    naturezaOperacao: (data.natureza_operacao as string | null)?.trim() || "1",
    regimeEspecialTributacao:
      (data.regime_especial_tributacao as string | null)?.trim() || null,
    optanteSimplesNacional: Boolean(data.optante_simples_nacional),
    issRetidoPadrao: Boolean(data.iss_retido_padrao),
  };
}

export function validarConfigFocusParaEmissao(
  config: ConfigFocusNfeEmpresa,
  temToken: boolean,
): string | null {
  if (!temToken) return "Configure o token Focus NFe em Parâmetros.";
  if (config.prestadorCnpj.length !== 14) {
    return "CNPJ do prestador inválido nos parâmetros Focus NFe.";
  }
  if (!config.prestadorInscricaoMunicipal) {
    return "Informe a inscrição municipal do prestador nos parâmetros.";
  }
  if (config.prestadorCodigoMunicipio.length !== 7) {
    return "Código IBGE do município do prestador deve ter 7 dígitos.";
  }
  return null;
}
