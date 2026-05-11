import type { SupabaseClient } from "@supabase/supabase-js";

function byteaParaBuffer(v: unknown): Buffer {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (typeof v === "string") {
    if (v.startsWith("\\x")) return Buffer.from(v.slice(2), "hex");
    if (/^[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0) {
      return Buffer.from(v, "hex");
    }
    return Buffer.from(v, "base64");
  }
  throw new Error("Formato de certificado no banco inesperado.");
}

/**
 * PostgREST serializa o body com JSON.stringify sem tratar Buffer (vira `{type, data}` e corrompe bytea).
 * Formato aceito para coluna bytea: string `\x` + hex.
 */
export function bufferParaByteaPostgrest(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}
import {
  cifrarBuffer,
  cifrarSenhaUtf8,
  decifrarBuffer,
  decifrarSenhaUtf8,
  deriveMasterKeyFromEnv,
} from "./cert-crypto";

export type MaterialCertificadoNfe = {
  pfx: Buffer;
  senha: string;
};

export type MetadataCertificadoNfe = {
  atualizadoEm: string;
};

/**
 * Descriptografa certificado e senha da empresa (uso apenas em servidor ao assinar/enviar SOAP).
 */
export async function obterMaterialCertificadoNfe(
  supabase: SupabaseClient,
  idEmpresa: number,
): Promise<MaterialCertificadoNfe | null> {
  const masterKey = deriveMasterKeyFromEnv();
  const { data, error } = await supabase
    .from("empresa_nfe_certificados")
    .select("pfx_cifrado, senha_cifrada")
    .eq("id_empresa", idEmpresa)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.pfx_cifrado || !data?.senha_cifrada) return null;

  const pfxBuf = byteaParaBuffer(data.pfx_cifrado);
  try {
    const pfx = decifrarBuffer(pfxBuf, masterKey);
    const senha = decifrarSenhaUtf8(data.senha_cifrada as string, masterKey);
    return { pfx, senha };
  } catch {
    throw new Error(
      "Não foi possível ler o certificado cifrado. Confirme NFE_CERT_MASTER_KEY e envie o .pfx novamente em Parâmetros.",
    );
  }
}

export async function obterMetadataCertificadoNfe(
  supabase: SupabaseClient,
  idEmpresa: number,
): Promise<MetadataCertificadoNfe | null> {
  const { data, error } = await supabase
    .from("empresa_nfe_certificados")
    .select("updated_at")
    .eq("id_empresa", idEmpresa)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.updated_at) return null;
  return { atualizadoEm: data.updated_at as string };
}

export function prepararGravacaoCertificado(pfxPlain: Buffer, senhaPlain: string): {
  pfx_cifrado: Buffer;
  senha_cifrada: string;
} {
  const masterKey = deriveMasterKeyFromEnv();
  return {
    pfx_cifrado: cifrarBuffer(pfxPlain, masterKey),
    senha_cifrada: cifrarSenhaUtf8(senhaPlain, masterKey),
  };
}
