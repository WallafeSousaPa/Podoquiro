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
 * API municipal de Belém — POST `{ dpsXmlGZipB64 }` (mesmo contrato da Sefin).
 * Só `/notafiscal-ws/nfse` aceita POST. `/api/adn` e `/api/adn/nfse` devolvem 404.
 */
export function urlNfseBelemMunicipal(ambiente: AmbienteNfe): string {
  if (ambiente === 2) {
    return "https://homol-nfse2.belem.pa.gov.br/notafiscal-ws/nfse";
  }
  return "https://nfseapi.belem.pa.gov.br/notafiscal-ws/nfse";
}

/** Homologação DSF alternativa. Em produção coincide com a URL principal. */
export function urlNfseBelemMunicipalFallback(ambiente: AmbienteNfe): string {
  if (ambiente === 2) {
    return "https://nfse2-bel.dsfweb.com.br/notafiscal-ws/nfse";
  }
  return "https://nfseapi.belem.pa.gov.br/notafiscal-ws/nfse";
}

/**
 * Resolução CGSN nº 191/2026: a partir da competência 01/11/2026, ME/EPP do
 * Simples Nacional emite só no Emissor Nacional (Sefin), mesmo em município
 * com sistema próprio (Belém).
 */
export const COMPETENCIA_EMISSOR_NACIONAL_SN = "2026-11-01";

export function deveEmitirPeloEmissorNacional(params: {
  optanteSimplesNacional: boolean;
  dCompet: string;
}): boolean {
  if (!params.optanteSimplesNacional) return false;
  const d = String(params.dCompet ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= COMPETENCIA_EMISSOR_NACIONAL_SN;
}

export function urlEmitirDpsNfse(params: {
  ambiente: AmbienteNfe;
  codigoMunicipioPrestador: string;
  optanteSimplesNacional?: boolean;
  dCompet?: string;
}): string {
  if (
    params.optanteSimplesNacional &&
    params.dCompet &&
    deveEmitirPeloEmissorNacional({
      optanteSimplesNacional: true,
      dCompet: params.dCompet,
    })
  ) {
    return urlSefinEmitirNfse(params.ambiente);
  }
  if (municipioNfseBelem(params.codigoMunicipioPrestador)) {
    return urlNfseBelemMunicipal(params.ambiente);
  }
  return urlSefinEmitirNfse(params.ambiente);
}

/** GET DANFSe (PDF) no ADN nacional. A chave na URL são 50 dígitos (sem prefixo NFS). */
export function urlAdnDanfse(ambiente: AmbienteNfe, chaveAcesso: string): string {
  const chave = encodeURIComponent(chaveAcesso.trim());
  if (ambiente === 2) {
    return `https://adn.producaorestrita.nfse.gov.br/danfse/${chave}`;
  }
  return `https://adn.nfse.gov.br/danfse/${chave}`;
}

/** GET DANFSe (PDF) na Sefin Nacional. */
export function urlSefinDanfse(ambiente: AmbienteNfe, chaveAcesso: string): string {
  return `${urlSefinNacionalBase(ambiente)}/danfse/${encodeURIComponent(chaveAcesso.trim())}`;
}

/** GET DANFSe (PDF) na API municipal de Belém. */
export function urlNfseBelemDanfse(ambiente: AmbienteNfe, chaveAcesso: string): string {
  const chave = encodeURIComponent(chaveAcesso.trim());
  if (ambiente === 2) {
    return `https://homol-nfse2.belem.pa.gov.br/notafiscal-ws/danfse/${chave}`;
  }
  return `https://nfseapi.belem.pa.gov.br/notafiscal-ws/danfse/${chave}`;
}
