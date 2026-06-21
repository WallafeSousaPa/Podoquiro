import { createHash } from "node:crypto";
import type { AmbienteNfe } from "./types";
import { urlConsultaChaveNfcePa, urlQrCodeNfcePa } from "./nfce-urls";

/** Versão do QR Code da NFC-e compatível com o layout 4.00. */
const VERSAO_QRCODE = "2";

export type DadosQrCodeNfce = {
  /** Conteúdo completo do elemento `<qrCode>` (URL + `?p=`). */
  qrCode: string;
  /** Conteúdo do elemento `<urlChave>` (consulta manual por chave). */
  urlChave: string;
};

/**
 * Monta o QR Code da NFC-e (emissão **normal/online**, QR Code v2.00), conforme o
 * "Manual de Padrões Técnicos do DANFE-NFC-e e QR Code".
 *
 * Parâmetros (separados por `|`): chave|versão|tpAmb|cIdToken|cHashQRCode.
 * `cHashQRCode` = SHA-1 (hex maiúsculo) de `chave|versão|tpAmb|cIdToken` concatenado ao **CSC**.
 * `cIdToken` é informado sem zeros não significativos.
 */
export function gerarQrCodeNfce(opts: {
  chave44: string;
  tpAmb: AmbienteNfe;
  /** Identificador do CSC (idCSC), ex.: "000001". */
  idCsc: string;
  /** Código de Segurança do Contribuinte (token alfanumérico). */
  csc: string;
  ambiente: AmbienteNfe;
}): DadosQrCodeNfce {
  const chave = opts.chave44.replace(/\D/g, "");
  if (chave.length !== 44) throw new Error("chave44 deve ter 44 dígitos para o QR Code.");

  const csc = opts.csc.trim();
  if (!csc) throw new Error("CSC não configurado (defina NFE_CSC).");

  const cIdTokenNum = Number.parseInt(opts.idCsc.replace(/\D/g, ""), 10);
  if (!Number.isFinite(cIdTokenNum) || cIdTokenNum <= 0) {
    throw new Error("idCSC inválido (defina NFE_CSC_ID, ex.: 000001).");
  }
  const cIdToken = String(cIdTokenNum);

  const tpAmb = String(opts.tpAmb);
  const dadosBase = `${chave}|${VERSAO_QRCODE}|${tpAmb}|${cIdToken}`;
  const cHash = createHash("sha1").update(dadosBase + csc, "utf8").digest("hex").toUpperCase();

  const qrCode = `${urlQrCodeNfcePa(opts.ambiente)}?p=${dadosBase}|${cHash}`;
  const urlChave = urlConsultaChaveNfcePa(opts.ambiente);
  return { qrCode, urlChave };
}

/**
 * Insere `<infNFeSupl>` (QR Code + urlChave) imediatamente **antes** da `<Signature>`,
 * respeitando a ordem do schema da NFC-e (`infNFe` → `infNFeSupl` → `Signature`).
 * Deve ser chamado sobre o XML **já assinado**: a assinatura cobre apenas `infNFe`,
 * então acrescentar `infNFeSupl` como irmão não invalida o digest.
 */
export function inserirInfNFeSuplNfce(
  xmlAssinado: string,
  dados: DadosQrCodeNfce,
): string {
  const supl =
    `<infNFeSupl>` +
    `<qrCode><![CDATA[${dados.qrCode}]]></qrCode>` +
    `<urlChave>${dados.urlChave}</urlChave>` +
    `</infNFeSupl>`;
  const idx = xmlAssinado.search(/<Signature[\s>]/);
  if (idx === -1) {
    throw new Error("Assinatura não encontrada: não foi possível inserir infNFeSupl.");
  }
  return xmlAssinado.slice(0, idx) + supl + xmlAssinado.slice(idx);
}
