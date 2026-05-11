import type { AmbienteNfe, SiglaUf } from "./types";

function envAmbiente(): AmbienteNfe {
  const raw = process.env.NFE_AMBIENTE?.trim();
  if (raw === "1") return 1;
  return 2;
}

/** UF do emitente na NF-e. Por ora o projeto está calibrado para **PA** (SVRS). */
function envUfEmitente(): SiglaUf {
  const u = process.env.NFE_UF?.trim().toUpperCase();
  if (u === "PA") return "PA";
  return "PA";
}

export type ConfigNfeGlobal = {
  ufEmitente: SiglaUf;
  ambiente: AmbienteNfe;
  /**
   * Legado: certificado por arquivo no disco. Preferir tabela `empresa_nfe_certificados`
   * (cifrado) quando integrar SOAP.
   */
  certificadoPath: string;
  certificadoSenha: string;
  /** PA usa autorização centralizada no SVRS. */
  autorizadoraNfe: "SVRS";
};

/**
 * Configuração global. Certificado: preferir `obterMaterialCertificadoNfe` (banco cifrado).
 */
export function getConfigNfeGlobal(): ConfigNfeGlobal {
  return {
    ufEmitente: envUfEmitente(),
    ambiente: envAmbiente(),
    certificadoPath: process.env.NFE_CERT_PATH?.trim() ?? "",
    certificadoSenha: process.env.NFE_CERT_PASSWORD ?? "",
    autorizadoraNfe: "SVRS",
  };
}
