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

function cnpjBase8(cnpj: string | null | undefined): string | null {
  const d = (cnpj ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  return d.slice(0, 8);
}

async function materialDaEmpresaExata(
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
    throw new Error("CERTIFICADO_CIFRADO_CHAVE_INVALIDA");
  }
}

/**
 * Lojas com o mesmo CNPJ-base (matriz/filial) ou do mesmo grupo compartilham o A1.
 * Ex.: certificado cadastrado na Podoquiro vale para Pé na Entrega.
 */
async function idEmpresaComCertificadoCompativel(
  supabase: SupabaseClient,
  idEmpresa: number,
): Promise<number | null> {
  const { data: atual, error: empErr } = await supabase
    .from("empresas")
    .select("cnpj_cpf, id_empresa_grupo")
    .eq("id", idEmpresa)
    .maybeSingle();
  if (empErr) throw new Error(empErr.message);
  if (!atual) return null;

  const base = cnpjBase8(atual.cnpj_cpf as string | null | undefined);
  const idGrupo = Number(atual.id_empresa_grupo);

  const { data: todas, error: listErr } = await supabase
    .from("empresas")
    .select("id, cnpj_cpf, id_empresa_grupo");
  if (listErr) throw new Error(listErr.message);

  const candidatas = (todas ?? [])
    .map((e) => ({
      id: Number(e.id),
      base: cnpjBase8(e.cnpj_cpf as string | null),
      grupo: Number(e.id_empresa_grupo),
    }))
    .filter((e) => Number.isFinite(e.id) && e.id > 0 && e.id !== idEmpresa)
    .filter((e) => {
      if (base && e.base === base) return true;
      if (Number.isFinite(idGrupo) && idGrupo > 0 && e.grupo === idGrupo) return true;
      return false;
    })
    .map((e) => e.id);
  if (candidatas.length === 0) return null;

  const { data: certs, error: certErr } = await supabase
    .from("empresa_nfe_certificados")
    .select("id_empresa")
    .in("id_empresa", candidatas);
  if (certErr) throw new Error(certErr.message);

  const porCnpj = (certs ?? [])
    .map((c) => Number(c.id_empresa))
    .filter((id) => {
      const e = (todas ?? []).find((x) => Number(x.id) === id);
      return base != null && cnpjBase8(e?.cnpj_cpf as string | null) === base;
    });
  const escolhido = porCnpj[0] ?? Number((certs ?? [])[0]?.id_empresa);
  return Number.isFinite(escolhido) && escolhido > 0 ? escolhido : null;
}

/**
 * Descriptografa certificado e senha da empresa (uso apenas em servidor ao assinar/enviar SOAP).
 * Se a loja não tiver A1 próprio, usa o de outra loja com o mesmo CNPJ ou do mesmo grupo.
 */
export async function obterMaterialCertificadoNfe(
  supabase: SupabaseClient,
  idEmpresa: number,
): Promise<MaterialCertificadoNfe | null> {
  const proprio = await materialDaEmpresaExata(supabase, idEmpresa);
  if (proprio) return proprio;
  const idFonte = await idEmpresaComCertificadoCompativel(supabase, idEmpresa);
  if (!idFonte) return null;
  return materialDaEmpresaExata(supabase, idFonte);
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
  if (data?.updated_at) return { atualizadoEm: data.updated_at as string };

  const idFonte = await idEmpresaComCertificadoCompativel(supabase, idEmpresa);
  if (!idFonte) return null;
  const { data: compartilhado, error: sharedErr } = await supabase
    .from("empresa_nfe_certificados")
    .select("updated_at")
    .eq("id_empresa", idFonte)
    .maybeSingle();
  if (sharedErr) throw new Error(sharedErr.message);
  if (!compartilhado?.updated_at) return null;
  return { atualizadoEm: compartilhado.updated_at as string };
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
