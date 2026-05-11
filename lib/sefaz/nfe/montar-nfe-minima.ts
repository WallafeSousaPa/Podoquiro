import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";

const NS_NFE = "http://www.portalfiscal.inf.br/nfe";

/** Texto obrigatório do destinatário em homologação (NF-e 55). */
export const XNOME_DEST_HOMOLOGACAO =
  "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

/**
 * NCM 8 dígitos existente na TIPI/SEFAZ para linha de teste (rejeição **778** se inválido).
 * Códigos antigos (ex.: 96021900) podem sair da tabela após atualizações da NCM.
 */
export const NCM_PADRAO_NFE_TESTE = "73269090";

function normalizarNcm8Digitos(raw: string | undefined, fallback: string): string {
  const d = (raw ?? "").replace(/\D/g, "").slice(0, 8);
  return d.length === 8 ? d : fallback;
}

export type DadosEmitenteNfeMinimo = {
  cnpj14: string;
  razaoSocial: string;
  nomeFantasia?: string;
  ie: string;
  crt: number;
  /** Logradouro sem número (campo xLgr). */
  logradouro: string;
  nro: string;
  complemento?: string | null;
  bairro: string;
  cMun: string;
  xMun: string;
  uf: string;
  cep: string;
  fone?: string | null;
};

/**
 * Campo `IE` do emitente no XSD (TIe): numérico (2–14 dígitos) ou literal **ISENTO**.
 * Não usar só `replace(/\D/g)` — remove letras e quebra "ISENTO".
 */
export function normalizarIeNfeEmitente(ieBruta: string): string {
  const t = ieBruta.trim();
  if (!t) throw new Error("IE do emitente vazia.");
  const compact = t.replace(/\s+/g, "").toUpperCase();
  if (compact === "ISENTO" || compact === "ISENTA") return "ISENTO";
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 2) {
    return digits.length > 14 ? digits.slice(0, 14) : digits;
  }
  const alnum = t.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (alnum.length >= 2 && alnum.length <= 14) return alnum;
  throw new Error(
    `IE inválida para o schema NF-e (use 2–14 dígitos ou a palavra ISENTO): "${ieBruta}"`,
  );
}

export type MontarNfeMinimaHomologOpts = {
  emitente: DadosEmitenteNfeMinimo;
  /** Chave 44 dígitos (com DV). `cNF` e `cDV` em `ide` são derivados daqui. */
  chave44: string;
  serie: number;
  nNF: number;
  /** Valor total da nota (ex.: 1.00). */
  vNF: string;
  /** dhEmi ISO com fuso, ex.: 2026-05-09T14:30:00-03:00 */
  dhEmi: string;
  /** CPF do destinatário (11 dígitos), ex. consumidor final teste. */
  cpfDest: string;
  /** NCM 8 dígitos (TIPI); se inválido ou vazio, usa {@link NCM_PADRAO_NFE_TESTE}. */
  ncm8?: string;
};

/** xmldom `Document`/`Element` não coincidem com os tipos DOM globais do TypeScript. */
function el(doc: any, parent: any, name: string, text?: string): any {
  const e = doc.createElementNS(NS_NFE, name);
  if (text !== undefined) e.appendChild(doc.createTextNode(text));
  parent.appendChild(e);
  return e;
}

/**
 * NF-e 55 mínima para **homologação** (Simples Nacional, CSOSN 102, uma linha de serviço).
 * Retorna XML **sem** declaração `<?xml` (exigência do lote SEFAZ).
 */
export function montarNfeXmlMinimaHomologacao(opts: MontarNfeMinimaHomologOpts): string {
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
  const cpfDest = opts.cpfDest.replace(/\D/g, "").padStart(11, "0");
  const ncm = normalizarNcm8Digitos(opts.ncm8, NCM_PADRAO_NFE_TESTE);

  const infNFe = el(doc, nfe, "infNFe");
  infNFe.setAttribute("versao", "4.00");
  infNFe.setAttribute("Id", idInf);

  const ide = el(doc, infNFe, "ide");
  el(doc, ide, "cUF", String(chave44.slice(0, 2)));
  el(doc, ide, "cNF", cNF);
  el(doc, ide, "natOp", "VENDA");
  el(doc, ide, "mod", "55");
  el(doc, ide, "serie", String(opts.serie));
  el(doc, ide, "nNF", String(opts.nNF));
  el(doc, ide, "dhEmi", opts.dhEmi);
  el(doc, ide, "tpNF", "1");
  el(doc, ide, "idDest", "1");
  el(doc, ide, "cMunFG", emit.cMun.padStart(7, "0"));
  el(doc, ide, "tpImp", "1");
  el(doc, ide, "tpEmis", "1");
  el(doc, ide, "cDV", cDV);
  el(doc, ide, "tpAmb", "2");
  el(doc, ide, "finNFe", "1");
  el(doc, ide, "indFinal", "1");
  el(doc, ide, "indPres", "1");
  el(doc, ide, "procEmi", "0");
  el(doc, ide, "verProc", "Podoquiro-1");

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

  const dest = el(doc, infNFe, "dest");
  el(doc, dest, "CPF", cpfDest);
  el(doc, dest, "xNome", XNOME_DEST_HOMOLOGACAO);
  const enderDest = el(doc, dest, "enderDest");
  el(doc, enderDest, "xLgr", emit.logradouro.trim().slice(0, 60));
  el(doc, enderDest, "nro", "S/N");
  el(doc, enderDest, "xBairro", emit.bairro.trim().slice(0, 60));
  el(doc, enderDest, "cMun", emit.cMun.padStart(7, "0"));
  el(doc, enderDest, "xMun", emit.xMun.trim().slice(0, 60));
  el(doc, enderDest, "UF", emit.uf.trim().toUpperCase().slice(0, 2));
  el(doc, enderDest, "CEP", emit.cep.replace(/\D/g, "").padStart(8, "0"));
  el(doc, enderDest, "cPais", "1058");
  el(doc, enderDest, "xPais", "BRASIL");
  el(doc, dest, "indIEDest", "9");

  const det = el(doc, infNFe, "det");
  det.setAttribute("nItem", "1");
  const prod = el(doc, det, "prod");
  el(doc, prod, "cProd", "1");
  el(doc, prod, "cEAN", "SEM GTIN");
  el(doc, prod, "xProd", "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL");
  el(doc, prod, "NCM", ncm);
  el(doc, prod, "CFOP", "5102");
  el(doc, prod, "uCom", "UN");
  el(doc, prod, "qCom", "1.0000");
  el(doc, prod, "vUnCom", opts.vNF);
  el(doc, prod, "vProd", opts.vNF);
  el(doc, prod, "cEANTrib", "SEM GTIN");
  el(doc, prod, "uTrib", "UN");
  el(doc, prod, "qTrib", "1.0000");
  el(doc, prod, "vUnTrib", opts.vNF);
  el(doc, prod, "indTot", "1");

  const imposto = el(doc, det, "imposto");
  const icms = el(doc, imposto, "ICMS");
  const icmssn102 = el(doc, icms, "ICMSSN102");
  el(doc, icmssn102, "orig", "0");
  el(doc, icmssn102, "CSOSN", "102");
  const pis = el(doc, imposto, "PIS");
  const pisOutr = el(doc, pis, "PISOutr");
  el(doc, pisOutr, "CST", "49");
  el(doc, pisOutr, "vBC", "0.00");
  el(doc, pisOutr, "pPIS", "0.00");
  el(doc, pisOutr, "vPIS", "0.00");
  const cofins = el(doc, imposto, "COFINS");
  const cofOutr = el(doc, cofins, "COFINSOutr");
  el(doc, cofOutr, "CST", "49");
  el(doc, cofOutr, "vBC", "0.00");
  el(doc, cofOutr, "pCOFINS", "0.00");
  el(doc, cofOutr, "vCOFINS", "0.00");

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
  el(doc, icmsTot, "vProd", opts.vNF);
  el(doc, icmsTot, "vFrete", z);
  el(doc, icmsTot, "vSeg", z);
  el(doc, icmsTot, "vDesc", z);
  el(doc, icmsTot, "vII", z);
  el(doc, icmsTot, "vIPI", z);
  el(doc, icmsTot, "vIPIDevol", z);
  el(doc, icmsTot, "vPIS", z);
  el(doc, icmsTot, "vCOFINS", z);
  el(doc, icmsTot, "vOutro", z);
  el(doc, icmsTot, "vNF", opts.vNF);
  el(doc, icmsTot, "vTotTrib", z);

  const transp = el(doc, infNFe, "transp");
  el(doc, transp, "modFrete", "9");

  const pag = el(doc, infNFe, "pag");
  const detPag = el(doc, pag, "detPag");
  el(doc, detPag, "indPag", "0");
  el(doc, detPag, "tPag", "01");
  el(doc, detPag, "vPag", opts.vNF);

  const serializer = new XMLSerializer();
  return serializer.serializeToString(nfe);
}
