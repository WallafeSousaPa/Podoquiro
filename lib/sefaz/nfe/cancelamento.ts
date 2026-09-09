import { assinarEventoNfeXml } from "./assinar-nfe-xml";
import { postSoapComCertificado } from "./soap-https";
import type { AmbienteNfe } from "./types";

const NS_NFE = "http://www.portalfiscal.inf.br/nfe";
const NS_WSDL = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4";
const TP_EVENTO_CANCELAMENTO = "110111";

const CSTAT_CANCELAMENTO_OK = new Set(["135", "136", "155", "573", "218"]);

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function montarEnvelopeRecepcaoEvento(envEventoInner: string): string {
  const dados = `<nfeDadosMsg xmlns="${NS_WSDL}">${envEventoInner}</nfeDadosMsg>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
<soap:Body>${dados}</soap:Body>
</soap:Envelope>`;
}

function dhEventoAmericaBelem(d = new Date()): string {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/Belem" });
  return `${s.replace(" ", "T")}-03:00`;
}

export function normalizarJustificativaCancelamento(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export type ResultadoCancelamentoNfe = {
  envelopeEnviado: string;
  httpStatus: number;
  xmlRetorno: string;
};

export type RetornoCancelamentoNfe = {
  cStatLote: string | null;
  xMotivoLote: string | null;
  cStat: string | null;
  xMotivo: string | null;
  nProt: string | null;
  chNFe: string | null;
};

/** Interpreta `retEnvEvento` / `retEvento` do cancelamento. */
export function extrairRetornoCancelamento(xml: string): RetornoCancelamentoNfe {
  const loteInner =
    xml.match(/<[^:>\s]*:?retEnvEvento\b[^>]*>([\s\S]*?)<\/[^:>\s]*:?retEnvEvento>/i)?.[1] ??
    "";
  const infInner =
    xml.match(
      /<[^:>\s]*:?retEvento\b[\s\S]*?<[^:>\s]*:?infEvento\b[^>]*>([\s\S]*?)<\/[^:>\s]*:?infEvento>/i,
    )?.[1] ?? "";
  return {
    cStatLote: loteInner.match(/<cStat[^>]*>([^<]+)<\/cStat>/i)?.[1]?.trim() ?? null,
    xMotivoLote: loteInner.match(/<xMotivo[^>]*>([\s\S]*?)<\/xMotivo>/i)?.[1]?.trim() ?? null,
    cStat: infInner.match(/<cStat[^>]*>([^<]+)<\/cStat>/i)?.[1]?.trim() ?? null,
    xMotivo: infInner.match(/<xMotivo[^>]*>([\s\S]*?)<\/xMotivo>/i)?.[1]?.trim() ?? null,
    nProt: infInner.match(/<nProt[^>]*>([^<]+)<\/nProt>/i)?.[1]?.trim() ?? null,
    chNFe: infInner.match(/<chNFe[^>]*>([^<]+)<\/chNFe>/i)?.[1]?.trim() ?? null,
  };
}

export function cancelamentoFoiRegistrado(cStat: string | null): boolean {
  return cStat != null && CSTAT_CANCELAMENTO_OK.has(cStat);
}

/**
 * Envia evento de cancelamento (110111) via `NFeRecepcaoEvento4`.
 * `justificativa` já normalizada, 15–255 caracteres.
 */
export async function enviarCancelamentoNfe(opts: {
  urlEndpoint: string;
  chave44: string;
  protocoloAutorizacao: string;
  tpAmb: AmbienteNfe;
  pfx: Buffer;
  senhaCertificado: string;
  justificativa: string;
  nSeqEvento?: number;
}): Promise<ResultadoCancelamentoNfe> {
  const chave = opts.chave44.replace(/\D/g, "");
  if (chave.length !== 44) {
    throw new Error("Chave de acesso inválida para cancelamento.");
  }
  const nSeq = Math.max(1, Math.min(99, opts.nSeqEvento ?? 1));
  const idInf = `ID${TP_EVENTO_CANCELAMENTO}${chave}${String(nSeq).padStart(2, "0")}`;
  const cOrgao = chave.slice(0, 2);
  const cnpj = chave.slice(6, 20);
  const xJust = xmlEscape(opts.justificativa);
  const nProt = xmlEscape(opts.protocoloAutorizacao.trim());
  const dhEvento = dhEventoAmericaBelem();

  const eventoSemAssinatura =
    `<evento xmlns="${NS_NFE}" versao="1.00">` +
    `<infEvento Id="${idInf}">` +
    `<cOrgao>${cOrgao}</cOrgao>` +
    `<tpAmb>${opts.tpAmb}</tpAmb>` +
    `<CNPJ>${cnpj}</CNPJ>` +
    `<chNFe>${chave}</chNFe>` +
    `<dhEvento>${dhEvento}</dhEvento>` +
    `<tpEvento>${TP_EVENTO_CANCELAMENTO}</tpEvento>` +
    `<nSeqEvento>${nSeq}</nSeqEvento>` +
    `<verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00">` +
    `<descEvento>Cancelamento</descEvento>` +
    `<nProt>${nProt}</nProt>` +
    `<xJust>${xJust}</xJust>` +
    `</detEvento>` +
    `</infEvento>` +
    `</evento>`;

  const eventoAssinado = assinarEventoNfeXml(eventoSemAssinatura, opts.pfx, opts.senhaCertificado);
  const idLote = String(Date.now()).replace(/\D/g, "").slice(-15) || "1";
  const inner =
    `<envEvento xmlns="${NS_NFE}" versao="1.00">` +
    `<idLote>${idLote}</idLote>` +
    `${eventoAssinado}` +
    `</envEvento>`;
  const envelope = montarEnvelopeRecepcaoEvento(inner);
  const res = await postSoapComCertificado(
    opts.urlEndpoint,
    envelope,
    opts.pfx,
    opts.senhaCertificado,
    'application/soap+xml;charset=utf-8;action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento"',
  );
  return { envelopeEnviado: envelope, httpStatus: res.statusCode, xmlRetorno: res.body };
}
