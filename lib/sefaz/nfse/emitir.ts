import type { AmbienteNfe } from "../nfe/types";
import { postJsonComCertificado } from "../nfe/soap-https";
import {
  extrairErrosSefin,
  mensagemErrosSefinDeResposta,
  type SefinNfseErroItem,
} from "./erros";
import { gunzipB64ParaUtf8, gzipUtf8ParaB64, xmlDpsComEncodingUtf8 } from "./gzip-b64";
import { urlEmitirDpsNfse, urlSefinEmitirNfse } from "./urls";

export type { SefinNfseErroItem };

export type SefinNfseResposta = {
  tipoAmbiente?: string;
  versaoAplicativo?: string;
  dataHoraProcessamento?: string;
  idDps?: string;
  chaveAcesso?: string;
  nfseXmlGZipB64?: string;
  erros?: SefinNfseErroItem[];
};

export class SefinNfseApiError extends Error {
  status: number;
  body: unknown;
  erros: SefinNfseErroItem[];

  constructor(message: string, status: number, body: unknown, erros: SefinNfseErroItem[] = []) {
    super(message);
    this.name = "SefinNfseApiError";
    this.status = status;
    this.body = body;
    this.erros = erros;
  }
}

function parseJsonSefin(body: string): SefinNfseResposta | null {
  const t = body.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as SefinNfseResposta;
  } catch {
    return null;
  }
}

function recorteCorpo(body: string): string {
  const t = body.trim().replace(/\s+/g, " ");
  return t.slice(0, 1200) || "(corpo vazio)";
}

function corpoEhHtml(body: string): boolean {
  const t = body.trimStart();
  return /^<!DOCTYPE html/i.test(t) || /^<html[\s>]/i.test(t);
}

export { mensagemErrosSefin, mensagemErrosSefinDeResposta } from "./erros";

export function numeroNfseDoXml(xml: string): string | null {
  const m = xml.match(/<(?:\w+:)?nNFSe>([^<]+)<\/(?:\w+:)?nNFSe>/i);
  const n = m?.[1]?.trim();
  return n || null;
}

export function codigoVerificacaoDoXml(xml: string): string | null {
  const m = xml.match(/<(?:\w+:)?cVerif>([^<]+)<\/(?:\w+:)?cVerif>/i);
  const n = m?.[1]?.trim();
  return n || null;
}

export async function enviarDpsSefinNacional(params: {
  xmlAssinado: string;
  pfx: Buffer;
  senha: string;
  ambiente: AmbienteNfe;
  /** Prestador IBGE — Belém usa a API municipal, não a Sefin pública. */
  codigoMunicipioPrestador?: string;
  /** Sobrescreve a URL (testes). */
  url?: string;
}): Promise<{
  resposta: SefinNfseResposta;
  xmlNfse: string | null;
  numeroNfse: string | null;
  codigoVerificacao: string | null;
}> {
  const url =
    params.url ??
    (params.codigoMunicipioPrestador
      ? urlEmitirDpsNfse({
          ambiente: params.ambiente,
          codigoMunicipioPrestador: params.codigoMunicipioPrestador,
        })
      : urlSefinEmitirNfse(params.ambiente));
  const xmlEnvio = xmlDpsComEncodingUtf8(params.xmlAssinado);
  const payload = JSON.stringify({ dpsXmlGZipB64: gzipUtf8ParaB64(xmlEnvio) });
  const { statusCode, body } = await postJsonComCertificado(
    url,
    payload,
    params.pfx,
    params.senha,
  );

  if (statusCode !== 201) {
    console.error(
      `[nfse-dps] HTTP ${statusCode} ${url} corpo=${recorteCorpo(body)}`,
    );
  }

  if (corpoEhHtml(body)) {
    throw new SefinNfseApiError(
      "A prefeitura devolveu uma página web em vez da API de NFS-e. " +
        "O webservice antigo (issdigitalbel) foi desativado; use o endpoint municipal atual.",
      statusCode || 502,
      recorteCorpo(body),
    );
  }

  const json = parseJsonSefin(body);
  const erros = extrairErrosSefin(json ?? body);
  const msgErros = mensagemErrosSefinDeResposta(json ?? body);

  if (msgErros) {
    throw new SefinNfseApiError(
      msgErros,
      statusCode >= 400 ? statusCode : 400,
      json ?? body,
      erros,
    );
  }

  if (statusCode >= 400 || !json) {
    throw new SefinNfseApiError(
      `A API de NFS-e recusou a nota (HTTP ${statusCode}): ${recorteCorpo(body)}`,
      statusCode || 502,
      json ?? body,
      erros,
    );
  }

  const chave = String(json.chaveAcesso ?? "").trim();
  if (!chave) {
    throw new SefinNfseApiError(
      "A API de NFS-e não retornou a chave de acesso da nota.",
      statusCode || 502,
      json,
      erros,
    );
  }

  let xmlNfse: string | null = null;
  if (json.nfseXmlGZipB64) {
    try {
      xmlNfse = gunzipB64ParaUtf8(json.nfseXmlGZipB64);
    } catch {
      xmlNfse = null;
    }
  }

  return {
    resposta: json,
    xmlNfse,
    numeroNfse: (xmlNfse ? numeroNfseDoXml(xmlNfse) : null) || chave,
    codigoVerificacao: xmlNfse ? codigoVerificacaoDoXml(xmlNfse) : null,
  };
}
