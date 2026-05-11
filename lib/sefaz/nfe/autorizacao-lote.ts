import { postSoapComCertificado } from "./soap-https";

const NS_NFE = "http://www.portalfiscal.inf.br/nfe";
const NS_WSDL = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4";

function montarEnvelopeAutorizacaoLote(enviNFeInner: string): string {
  const dados = `<nfeDadosMsg xmlns="${NS_WSDL}">${enviNFeInner}</nfeDadosMsg>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
<soap:Body>${dados}</soap:Body>
</soap:Envelope>`;
}

export type ResultadoAutorizacaoLote = {
  envelopeEnviado: string;
  httpStatus: number;
  xmlRetorno: string;
};

/**
 * Envia um lote com **uma** NF-e (`indSinc=1`). `xmlNFe` sem declaração XML.
 */
export async function enviarLoteNfeSincrono(opts: {
  urlEndpoint: string;
  versaoLayout: string;
  idLote: string;
  xmlNFeSemDeclaracao: string;
  pfx: Buffer;
  senhaCertificado: string;
}): Promise<ResultadoAutorizacaoLote> {
  const nfeBody = opts.xmlNFeSemDeclaracao.trim().replace(/^\uFEFF/, "");
  const inner = `<enviNFe xmlns="${NS_NFE}" versao="${opts.versaoLayout}"><idLote>${opts.idLote}</idLote><indSinc>1</indSinc>${nfeBody}</enviNFe>`;
  const envelope = montarEnvelopeAutorizacaoLote(inner);
  const res = await postSoapComCertificado(
    opts.urlEndpoint,
    envelope,
    opts.pfx,
    opts.senhaCertificado,
    'application/soap+xml;charset=utf-8;action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote"',
  );
  return { envelopeEnviado: envelope, httpStatus: res.statusCode, xmlRetorno: res.body };
}

/** Extrai campos principais do `retEnviNFe` / `infProt` (resposta bruta SOAP). */
export function extrairRetornoAutorizacaoLote(xml: string): {
  cStatLote: string | null;
  xMotivoLote: string | null;
  cStatProt: string | null;
  xMotivoProt: string | null;
  chNFe: string | null;
  nProt: string | null;
} {
  const retInner =
    xml.match(/<[^:>\s]*:?retEnviNFe\b[^>]*>([\s\S]*?)<\/[^:>\s]*:?retEnviNFe>/i)?.[1] ?? "";
  const protInner =
    xml.match(/<[^:>\s]*:?infProt\b[^>]*>([\s\S]*?)<\/[^:>\s]*:?infProt>/i)?.[1] ?? "";
  return {
    cStatLote: retInner.match(/<cStat[^>]*>([^<]+)<\/cStat>/i)?.[1]?.trim() ?? null,
    xMotivoLote: retInner.match(/<xMotivo[^>]*>([\s\S]*?)<\/xMotivo>/i)?.[1]?.trim() ?? null,
    cStatProt: protInner.match(/<cStat[^>]*>([^<]+)<\/cStat>/i)?.[1]?.trim() ?? null,
    xMotivoProt: protInner.match(/<xMotivo[^>]*>([\s\S]*?)<\/xMotivo>/i)?.[1]?.trim() ?? null,
    chNFe: protInner.match(/<chNFe[^>]*>([^<]+)<\/chNFe>/i)?.[1]?.trim() ?? null,
    nProt: protInner.match(/<nProt[^>]*>([^<]+)<\/nProt>/i)?.[1]?.trim() ?? null,
  };
}
