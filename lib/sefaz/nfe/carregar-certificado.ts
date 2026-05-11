import { readFileSync } from "fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getConfigNfeGlobal } from "./config";
import { obterMaterialCertificadoNfe, type MaterialCertificadoNfe } from "./certificado-db";

/**
 * Certificado da empresa: prioriza banco (`empresa_nfe_certificados`);
 * senão variáveis `NFE_CERT_PATH` + `NFE_CERT_PASSWORD`.
 */
export async function carregarCertificadoEmpresa(
  supabase: SupabaseClient,
  idEmpresa: number,
): Promise<MaterialCertificadoNfe | null> {
  const doBanco = await obterMaterialCertificadoNfe(supabase, idEmpresa);
  if (doBanco) return doBanco;

  const cfg = getConfigNfeGlobal();
  if (!cfg.certificadoPath || !cfg.certificadoSenha) return null;

  try {
    const pfx = readFileSync(cfg.certificadoPath);
    return { pfx, senha: cfg.certificadoSenha };
  } catch {
    return null;
  }
}
