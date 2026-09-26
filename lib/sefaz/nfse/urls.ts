import type { AmbienteNfe } from "../nfe/types";

/**
 * Sefin Nacional (Portal NFS-e).
 * Homologação usa `/API/SefinNacional`; produção usa `/SefinNacional` (docs.gov.br).
 */
export function urlSefinNacionalBase(ambiente: AmbienteNfe): string {
  if (ambiente === 1) {
    return "https://sefin.nfse.gov.br/SefinNacional";
  }
  return "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional";
}

/** POST `{ dpsXmlGZipB64 }` — autorização da DPS. */
export function urlSefinEmitirNfse(ambiente: AmbienteNfe): string {
  return `${urlSefinNacionalBase(ambiente)}/nfse`;
}

export const IBGE_BELEM = "1501402";

/** Belém emite no sistema próprio da SEFIN municipal (não no emissor público da Sefin). */
export function municipioNfseBelem(ibge: string): boolean {
  const d = String(ibge).replace(/\D/g, "");
  return d === IBGE_BELEM || d === "150142";
}

/**
 * API municipal de Belém — mesmo contrato da Sefin (DPS gzip+base64 + mTLS).
 * Documentado no portal: POST `/notafiscal-ws/nfse`.
 */
export function urlNfseBelemMunicipal(ambiente: AmbienteNfe): string {
  if (ambiente === 2) {
    return "https://nfse2-bel.dsfweb.com.br/notafiscal-ws/nfse";
  }
  return "https://nfseapi.belem.pa.gov.br/notafiscal-ws/nfse";
}

export function urlEmitirDpsNfse(params: {
  ambiente: AmbienteNfe;
  codigoMunicipioPrestador: string;
}): string {
  if (municipioNfseBelem(params.codigoMunicipioPrestador)) {
    return urlNfseBelemMunicipal(params.ambiente);
  }
  return urlSefinEmitirNfse(params.ambiente);
}
