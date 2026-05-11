import type { AmbienteNfe, SiglaUf } from "./types";
import { codigoUfParaNfe } from "./cuf-ibge";
import { postSoapComCertificado } from "./soap-https";

const NS_NFE = "http://www.portalfiscal.inf.br/nfe";
const NS_WSDL_STATUS = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4";

/** Envelope SOAP 1.2 alinhado ao uso do sped-nfe / SEFAZ 4.00 (sem wrapper nfeStatusServicoNF, sem CDATA). */
function montarEnvelopeStatusServico(tpAmb: AmbienteNfe, cUF: number): string {
  const consStatServ = `<consStatServ xmlns="${NS_NFE}" versao="4.00"><tpAmb>${tpAmb}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ></consStatServ>`;
  const dados = `<nfeDadosMsg xmlns="${NS_WSDL_STATUS}">${consStatServ}</nfeDadosMsg>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
<soap:Body>${dados}</soap:Body>
</soap:Envelope>`;
}

export function extrairRetornoStatusServico(xmlResposta: string): {
  cStat: string | null;
  xMotivo: string | null;
  dhResp?: string | null;
} {
  const bloque = xmlResposta.match(
    /<[^:>\s]*:?retConsStatServ\b[^>]*>[\s\S]*?<\/[^:>\s]*:?retConsStatServ>/i,
  );
  const inner = bloque?.[0] ?? xmlResposta;
  const cStat = inner.match(/<cStat[^>]*>([^<]+)<\/cStat>/i)?.[1]?.trim() ?? null;
  const xMotivo =
    inner.match(/<xMotivo[^>]*>([\s\S]*?)<\/xMotivo>/i)?.[1]?.trim() ?? null;
  const dhResp =
    inner.match(/<dhRecbto[^>]*>([^<]+)<\/dhRecbto>/i)?.[1]?.trim() ?? null;
  return { cStat, xMotivo, dhResp };
}

export async function consultarStatusServicoNfe(opts: {
  urlEndpoint: string;
  tpAmb: AmbienteNfe;
  ufEmitente: SiglaUf;
  pfx: Buffer;
  senhaCertificado: string;
}): Promise<{ envelopeEnviado: string; httpStatus: number; xmlRetorno: string }> {
  const cUF = codigoUfParaNfe(opts.ufEmitente);
  const envelope = montarEnvelopeStatusServico(opts.tpAmb, cUF);
  const res = await postSoapComCertificado(
    opts.urlEndpoint,
    envelope,
    opts.pfx,
    opts.senhaCertificado,
    'application/soap+xml;charset=utf-8;action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF"',
  );
  return {
    envelopeEnviado: envelope,
    httpStatus: res.statusCode,
    xmlRetorno: res.body,
  };
}
