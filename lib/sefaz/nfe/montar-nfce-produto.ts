import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";
import {
  normalizarIeNfeEmitente,
  XNOME_DEST_HOMOLOGACAO,
  type DadosEmitenteNfeMinimo,
} from "./montar-nfe-minima";

const NS_NFE = "http://www.portalfiscal.inf.br/nfe";

/** Texto obrigatório do item em homologação (NFC-e/NF-e). */
export const XPROD_HOMOLOGACAO =
  "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

function el(doc: any, parent: any, name: string, text?: string): any {
  const e = doc.createElementNS(NS_NFE, name);
  if (text !== undefined) e.appendChild(doc.createTextNode(text));
  parent.appendChild(e);
  return e;
}

function fmtDec(n: number, frac: number): string {
  return n.toFixed(frac);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

const PISNT_CSTS = new Set(["04", "06", "07", "08", "09"]);

export type LinhaProdutoNfce = {
  cProd: string;
  cEAN: string;
  xProd: string;
  ncm: string;
  cfop: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
  orig: number;
  csosn: string;
  pisCst: string;
  cofinsCst: string;
};

/** Destinatário da NFC-e é opcional (consumidor não identificado). */
export type DestinatarioNfce = {
  cpf11?: string;
  cnpj14?: string;
  xNome?: string;
};

export type PagamentoDetNfce = {
  tPag: string;
  vPag: number;
  card?: {
    /** 1 = TEF integrado; 2 = POS não integrado (maquineta). */
    tpIntegra: "1" | "2";
    /** Bandeira (obrigatório com cartão crédito/débito; omitir no PIX dinâmico). */
    tBand?: string;
    /** CNPJ da credenciadora / instituição de pagamento (14 dígitos). */
    cnpj14: string;
    /** Código de autorização / NSU (cartão) ou endToEndId (PIX dinâmico). */
    cAut: string;
  };
};

export type MontarNfceProdutoOpts = {
  emitente: DadosEmitenteNfeMinimo;
  chave44: string;
  serie: number;
  nNF: number;
  dhEmi: string;
  tpAmb: 1 | 2;
  natOp: string;
  linhas: LinhaProdutoNfce[];
  /** Ausente = venda a consumidor não identificado. */
  dest?: DestinatarioNfce | null;
  /** Forma de pagamento (tPag). Padrão "01" (dinheiro). Usado se `pagamentos` não for informado. */
  tPag?: string;
  /** Linhas de pagamento (`detPag`). Preferir em emissão pelo atendimento. */
  pagamentos?: PagamentoDetNfce[];
};

function appendPisCofins(doc: any, imposto: any, pisCst: string, cofinsCst: string): void {
  const pis = el(doc, imposto, "PIS");
  const pc = pisCst.padStart(2, "0").slice(0, 2);
  if (PISNT_CSTS.has(pc)) {
    const pisnt = el(doc, pis, "PISNT");
    el(doc, pisnt, "CST", pc);
  } else {
    const pisOutr = el(doc, pis, "PISOutr");
    el(doc, pisOutr, "CST", "49");
    el(doc, pisOutr, "vBC", "0.00");
    el(doc, pisOutr, "pPIS", "0.00");
    el(doc, pisOutr, "vPIS", "0.00");
  }

  const cofins = el(doc, imposto, "COFINS");
  const cc = cofinsCst.padStart(2, "0").slice(0, 2);
  if (PISNT_CSTS.has(cc)) {
    const cofnt = el(doc, cofins, "COFINSNT");
    el(doc, cofnt, "CST", cc);
  } else {
    const cofOutr = el(doc, cofins, "COFINSOutr");
    el(doc, cofOutr, "CST", "49");
    el(doc, cofOutr, "vBC", "0.00");
    el(doc, cofOutr, "pCOFINS", "0.00");
    el(doc, cofOutr, "vCOFINS", "0.00");
  }
}

/**
 * NFC-e (modelo 65) de **mercadoria**, operação interna a consumidor final, Simples Nacional
 * (`ICMSSN` + CSOSN por linha). Retorna o XML **sem** declaração `<?xml?>`, **sem** assinatura
 * e **sem** `infNFeSupl` — o QR Code é inserido após a assinatura.
 */
export function montarNfceXmlProduto(opts: MontarNfceProdutoOpts): string {
  if (!opts.linhas.length) throw new Error("Informe ao menos um item na nota.");

  const impl = new DOMImplementation();
  const doc = impl.createDocument(NS_NFE, "NFe", null);
  const nfe = doc.documentElement!;
  const chave44 = opts.chave44.replace(/\D/g, "");
  if (chave44.length !== 44) throw new Error("chave44 deve ter 44 dígitos.");
  const cNF = chave44.slice(35, 43);
  const cDV = chave44.slice(43, 44);
  const idInf = `NFe${chave44}`;
  const emit = opts.emitente;
  const cnpj = emit.cnpj14.replace(/\D/g, "").padStart(14, "0");
  const ie = normalizarIeNfeEmitente(emit.ie);
  const homolog = opts.tpAmb === 2;

  const vProdTotal = roundMoney(opts.linhas.reduce((s, l) => s + l.vProd, 0));
  const vNF = fmtDec(vProdTotal, 2);

  const infNFe = el(doc, nfe, "infNFe");
  infNFe.setAttribute("versao", "4.00");
  infNFe.setAttribute("Id", idInf);

  const ide = el(doc, infNFe, "ide");
  el(doc, ide, "cUF", String(chave44.slice(0, 2)));
  el(doc, ide, "cNF", cNF);
  el(doc, ide, "natOp", opts.natOp.trim().slice(0, 60));
  el(doc, ide, "mod", "65");
  el(doc, ide, "serie", String(opts.serie));
  el(doc, ide, "nNF", String(opts.nNF));
  el(doc, ide, "dhEmi", opts.dhEmi);
  el(doc, ide, "tpNF", "1");
  el(doc, ide, "idDest", "1");
  el(doc, ide, "cMunFG", emit.cMun.padStart(7, "0"));
  el(doc, ide, "tpImp", "4");
  el(doc, ide, "tpEmis", "1");
  el(doc, ide, "cDV", cDV);
  el(doc, ide, "tpAmb", String(opts.tpAmb));
  el(doc, ide, "finNFe", "1");
  el(doc, ide, "indFinal", "1");
  el(doc, ide, "indPres", "1");
  el(doc, ide, "procEmi", "0");
  el(doc, ide, "verProc", "Podoquiro-NFCe-1");

  const emitEl = el(doc, infNFe, "emit");
  el(doc, emitEl, "CNPJ", cnpj);
  el(doc, emitEl, "xNome", emit.razaoSocial.trim().slice(0, 60));
  if (emit.nomeFantasia?.trim()) {
    el(doc, emitEl, "xFant", emit.nomeFantasia.trim().slice(0, 60));
  }
  const enderEmit = el(doc, emitEl, "enderEmit");
  el(doc, enderEmit, "xLgr", emit.logradouro.trim().slice(0, 60));
  el(doc, enderEmit, "nro", emit.nro.trim().slice(0, 60));
  if (emit.complemento?.trim()) el(doc, enderEmit, "xCpl", emit.complemento.trim().slice(0, 60));
  el(doc, enderEmit, "xBairro", emit.bairro.trim().slice(0, 60));
  el(doc, enderEmit, "cMun", emit.cMun.padStart(7, "0"));
  el(doc, enderEmit, "xMun", emit.xMun.trim().slice(0, 60));
  el(doc, enderEmit, "UF", emit.uf.trim().toUpperCase().slice(0, 2));
  el(doc, enderEmit, "CEP", emit.cep.replace(/\D/g, "").padStart(8, "0"));
  el(doc, enderEmit, "cPais", "1058");
  el(doc, enderEmit, "xPais", "BRASIL");
  if (emit.fone?.replace(/\D/g, "")) {
    el(doc, enderEmit, "fone", emit.fone.replace(/\D/g, "").slice(0, 14));
  }
  el(doc, emitEl, "IE", ie);
  el(doc, emitEl, "CRT", String(emit.crt));

  const cpf = opts.dest?.cpf11?.replace(/\D/g, "") ?? "";
  const cnpjDest = opts.dest?.cnpj14?.replace(/\D/g, "") ?? "";
  const temDest = cpf.length === 11 || cnpjDest.length === 14;
  if (temDest) {
    const dest = el(doc, infNFe, "dest");
    if (cnpjDest.length === 14) {
      el(doc, dest, "CNPJ", cnpjDest);
    } else {
      el(doc, dest, "CPF", cpf.padStart(11, "0"));
    }
    const xNomeDest = (
      homolog ? XNOME_DEST_HOMOLOGACAO : (opts.dest?.xNome ?? "").trim()
    ).slice(0, 60);
    if (xNomeDest) el(doc, dest, "xNome", xNomeDest);
    el(doc, dest, "indIEDest", "9");
  }

  opts.linhas.forEach((linha, idx) => {
    const det = el(doc, infNFe, "det");
    det.setAttribute("nItem", String(idx + 1));
    const prod = el(doc, det, "prod");
    el(doc, prod, "cProd", linha.cProd.trim().slice(0, 60));
    el(doc, prod, "cEAN", linha.cEAN);
    const xProd = homolog && idx === 0 ? XPROD_HOMOLOGACAO : linha.xProd.trim().slice(0, 120);
    el(doc, prod, "xProd", xProd);
    el(doc, prod, "NCM", linha.ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8));
    el(doc, prod, "CFOP", linha.cfop.replace(/\D/g, "").padStart(4, "0").slice(0, 4));
    el(doc, prod, "uCom", linha.uCom.trim().slice(0, 6));
    el(doc, prod, "qCom", fmtDec(linha.qCom, 4));
    el(doc, prod, "vUnCom", fmtDec(linha.vUnCom, 10));
    el(doc, prod, "vProd", fmtDec(linha.vProd, 2));
    el(doc, prod, "cEANTrib", linha.cEAN);
    el(doc, prod, "uTrib", linha.uCom.trim().slice(0, 6));
    el(doc, prod, "qTrib", fmtDec(linha.qCom, 4));
    el(doc, prod, "vUnTrib", fmtDec(linha.vUnCom, 10));
    el(doc, prod, "indTot", "1");

    const imposto = el(doc, det, "imposto");
    const icms = el(doc, imposto, "ICMS");
    const tag = `ICMSSN${linha.csosn.replace(/\D/g, "").padStart(3, "0").slice(0, 3)}`;
    const icmsSn = el(doc, icms, tag);
    el(doc, icmsSn, "orig", String(linha.orig));
    el(doc, icmsSn, "CSOSN", linha.csosn.replace(/\D/g, "").padStart(3, "0").slice(0, 3));
    appendPisCofins(doc, imposto, linha.pisCst, linha.cofinsCst);
  });

  const total = el(doc, infNFe, "total");
  const icmsTot = el(doc, total, "ICMSTot");
  const z = "0.00";
  el(doc, icmsTot, "vBC", z);
  el(doc, icmsTot, "vICMS", z);
  el(doc, icmsTot, "vICMSDeson", z);
  el(doc, icmsTot, "vFCPUFDest", z);
  el(doc, icmsTot, "vICMSUFDest", z);
  el(doc, icmsTot, "vICMSUFRemet", z);
  el(doc, icmsTot, "vFCP", z);
  el(doc, icmsTot, "vBCST", z);
  el(doc, icmsTot, "vST", z);
  el(doc, icmsTot, "vFCPST", z);
  el(doc, icmsTot, "vFCPSTRet", z);
  el(doc, icmsTot, "vProd", vNF);
  el(doc, icmsTot, "vFrete", z);
  el(doc, icmsTot, "vSeg", z);
  el(doc, icmsTot, "vDesc", z);
  el(doc, icmsTot, "vII", z);
  el(doc, icmsTot, "vIPI", z);
  el(doc, icmsTot, "vIPIDevol", z);
  el(doc, icmsTot, "vPIS", z);
  el(doc, icmsTot, "vCOFINS", z);
  el(doc, icmsTot, "vOutro", z);
  el(doc, icmsTot, "vNF", vNF);
  el(doc, icmsTot, "vTotTrib", z);

  const transp = el(doc, infNFe, "transp");
  el(doc, transp, "modFrete", "9");

  const pag = el(doc, infNFe, "pag");
  const linhasPag =
    opts.pagamentos && opts.pagamentos.length > 0
      ? opts.pagamentos
      : [
          {
            tPag: (opts.tPag ?? "01").replace(/\D/g, "").padStart(2, "0").slice(0, 2),
            vPag: roundMoney(vProdTotal),
          },
        ];

  for (const lp of linhasPag) {
    const detPag = el(doc, pag, "detPag");
    const tPag = lp.tPag.replace(/\D/g, "").padStart(2, "0").slice(0, 2);
    el(doc, detPag, "tPag", tPag);
    el(doc, detPag, "vPag", fmtDec(lp.vPag, 2));
    if (tPag === "03" || tPag === "04" || tPag === "17") {
      const card = el(doc, detPag, "card");
      const tpIntegra = lp.card?.tpIntegra ?? "2";
      el(doc, card, "tpIntegra", tpIntegra);
      const cnpj = (lp.card?.cnpj14 ?? "").replace(/\D/g, "");
      if (cnpj.length === 14) {
        el(doc, card, "CNPJ", cnpj);
      }
      if (tPag === "03" || tPag === "04") {
        const tBand = (lp.card?.tBand ?? "99").replace(/\D/g, "").padStart(2, "0").slice(0, 2);
        el(doc, card, "tBand", tBand);
      }
      const cAut = (lp.card?.cAut ?? "0").trim().slice(0, 20) || "0";
      el(doc, card, "cAut", cAut);
    }
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(nfe);
}
