import { assinarLoteDsfXml } from "@/lib/sefaz/nfe";
import { montarXmlLoteRpsDsf, type DadosRpsDsf } from "./montar-lote";
import { envelopeSoapDsf, postSoapDsf } from "./soap";
import { URL_DSF_BELEM } from "./urls";

export class DsfNfseApiError extends Error {
  status: number;
  body: unknown;
  erros: { codigo?: string; descricao?: string }[];

  constructor(
    message: string,
    status: number,
    body: unknown,
    erros: { codigo?: string; descricao?: string }[] = [],
  ) {
    super(message);
    this.name = "DsfNfseApiError";
    this.status = status;
    this.body = body;
    this.erros = erros;
  }
}

function decodeEntidades(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlInternoDoSoap(soap: string): string {
  const ret = soap.match(
    /<(?:\w+:)?enviarSincronoReturn\b[^>]*>([\s\S]*?)<\/(?:\w+:)?enviarSincronoReturn>/i,
  );
  const bloco = ret?.[1] ?? soap;
  const cdata = bloco.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (cdata) return cdata[1] ?? bloco;
  const trimmed = bloco.trim();
  if (trimmed.includes("&lt;") || trimmed.includes("&gt;")) return decodeEntidades(trimmed);
  return trimmed || soap;
}

function textoTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "i"));
  const t = m?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
  return t || null;
}

function sucessoDsf(xml: string): boolean {
  return /<(?:\w+:)?Sucesso>\s*true\s*</i.test(xml);
}

function errosDsf(xml: string): { codigo?: string; descricao?: string }[] {
  const out: { codigo?: string; descricao?: string }[] = [];
  const re = /<(?:\w+:)?Erro\b[\s\S]*?<\/(?:\w+:)?Erro>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const bloco = m[0];
    out.push({
      codigo: textoTag(bloco, "Codigo") ?? undefined,
      descricao: textoTag(bloco, "Descricao") ?? textoTag(bloco, "Mensagem") ?? undefined,
    });
  }
  return out;
}

export async function enviarRpsDsfBelem(params: {
  dados: DadosRpsDsf;
  pfx: Buffer;
  senha: string;
}): Promise<{
  xmlRetorno: string;
  numeroNfse: string | null;
  codigoVerificacao: string | null;
  numeroLote: string | null;
}> {
  const { xml } = montarXmlLoteRpsDsf(params.dados);
  const xmlAssinado = assinarLoteDsfXml(xml, params.pfx, params.senha);
  const soap = envelopeSoapDsf("enviarSincrono", xmlAssinado);
  const { statusCode, body } = await postSoapDsf(URL_DSF_BELEM, soap);
  const interno = xmlInternoDoSoap(body);
  const alvo = interno.includes("Sucesso") || interno.includes("Erro") ? interno : body;

  const fault = textoTag(body, "faultstring");
  if (fault && statusCode >= 400) {
    throw new DsfNfseApiError(
      `Prefeitura de Belém recusou a NFS-e: ${fault.replace(/\s+/g, " ").slice(0, 500)}`,
      statusCode,
      body.slice(0, 4000),
    );
  }

  if (statusCode >= 400) {
    throw new DsfNfseApiError(
      fault
        ? `Prefeitura de Belém recusou a NFS-e: ${fault.replace(/\s+/g, " ").slice(0, 500)}`
        : `Prefeitura de Belém recusou a NFS-e (HTTP ${statusCode}).`,
      statusCode,
      body.slice(0, 4000),
    );
  }

  const erros = errosDsf(alvo);
  const msgErros = erros
    .map((e) => [e.codigo, e.descricao].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("; ");

  if (msgErros && !sucessoDsf(alvo)) {
    throw new DsfNfseApiError(msgErros, 400, alvo.slice(0, 4000), erros);
  }

  if (fault && !sucessoDsf(alvo)) {
    throw new DsfNfseApiError(
      `Prefeitura de Belém recusou a NFS-e: ${fault.replace(/\s+/g, " ").slice(0, 500)}`,
      400,
      body.slice(0, 4000),
    );
  }

  const numeroNfse = textoTag(alvo, "NumeroNFe") ?? textoTag(alvo, "NumeroNFSe");
  const codigoVerificacao = textoTag(alvo, "CodigoVerificacao");
  const numeroLote = textoTag(alvo, "NumeroLote");

  if (!sucessoDsf(alvo) && !numeroNfse) {
    throw new DsfNfseApiError(
      msgErros ||
        `Prefeitura de Belém não autorizou a NFS-e. ${alvo.replace(/\s+/g, " ").slice(0, 500)}`,
      400,
      alvo.slice(0, 4000),
      erros,
    );
  }

  return {
    xmlRetorno: alvo,
    numeroNfse,
    codigoVerificacao,
    numeroLote,
  };
}
