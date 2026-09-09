import { DOMParser } from "@xmldom/xmldom";

export type DanfeNfeItem = {
  nItem: number;
  cProd: string;
  xProd: string;
  ncm: string;
  cst: string;
  cfop: string;
  uCom: string;
  qCom: string;
  vUnCom: string;
  vProd: string;
  vBc: string;
  vIcms: string;
  vIpi: string;
  pIcms: string;
  pIpi: string;
};

export type DanfeNfeEndereco = {
  xLgr: string;
  nro: string;
  xCpl: string;
  xBairro: string;
  xMun: string;
  uf: string;
  cep: string;
  fone: string;
};

export type DanfeNfeDados = {
  tpAmb: number;
  tpNF: string;
  nNF: string;
  serie: string;
  dhEmi: string;
  dhSaiEnt: string;
  natOp: string;
  infCpl: string;
  emit: {
    cnpj: string;
    xNome: string;
    xFant: string;
    ie: string;
    ieST: string;
  } & DanfeNfeEndereco;
  dest: {
    doc: string;
    tipoDoc: "CPF" | "CNPJ" | null;
    xNome: string;
    ie: string;
    email: string;
  } & DanfeNfeEndereco;
  itens: DanfeNfeItem[];
  totais: {
    vBC: string;
    vICMS: string;
    vBCST: string;
    vST: string;
    vProd: string;
    vFrete: string;
    vSeg: string;
    vDesc: string;
    vOutro: string;
    vIPI: string;
    vNF: string;
  };
  transp: {
    modFrete: string;
    xNome: string;
    cnpj: string;
    ie: string;
    xEnder: string;
    xMun: string;
    uf: string;
    qVol: string;
    esp: string;
    marca: string;
    nVol: string;
    pesoL: string;
    pesoB: string;
  };
};

function primeiro(parent: Element | null | undefined, tag: string): Element | null {
  if (!parent) return null;
  const list = parent.getElementsByTagName(tag);
  return list.length > 0 ? (list[0] as unknown as Element) : null;
}

function texto(parent: Element | null | undefined, tag: string): string {
  const el = primeiro(parent, tag);
  return el?.textContent?.trim() ?? "";
}

function lerEndereco(parent: Element | null, tag: string): DanfeNfeEndereco {
  const el = primeiro(parent, tag);
  return {
    xLgr: texto(el, "xLgr"),
    nro: texto(el, "nro"),
    xCpl: texto(el, "xCpl"),
    xBairro: texto(el, "xBairro"),
    xMun: texto(el, "xMun"),
    uf: texto(el, "UF"),
    cep: texto(el, "CEP"),
    fone: texto(el, "fone"),
  };
}

/** Extrai os dados do DANFE (NF-e modelo 55) a partir do XML. */
export function extrairDanfeNfeDoXml(xmlNfe: string): DanfeNfeDados {
  const doc = new DOMParser().parseFromString(xmlNfe, "text/xml");
  const docEl = doc as unknown as Document;
  const infNFe = (docEl.getElementsByTagName("infNFe")[0] ?? null) as unknown as Element | null;
  if (!infNFe) throw new Error("XML da NF-e sem infNFe.");

  const ide = primeiro(infNFe, "ide");
  const emit = primeiro(infNFe, "emit");
  const destEl = primeiro(infNFe, "dest");
  const total = primeiro(infNFe, "total");
  const icmsTot = primeiro(total, "ICMSTot");
  const transp = primeiro(infNFe, "transp");
  const vol = primeiro(transp, "vol");
  const transporta = primeiro(transp, "transporta");
  const infAdic = primeiro(infNFe, "infAdic");
  const enderEmit = lerEndereco(emit, "enderEmit");
  const enderDest = lerEndereco(destEl, "enderDest");

  const itens: DanfeNfeItem[] = [];
  const dets = infNFe.getElementsByTagName("det");
  for (let i = 0; i < dets.length; i++) {
    const det = dets[i] as unknown as Element;
    const prod = primeiro(det, "prod");
    const imposto = primeiro(det, "imposto");
    const icms = primeiro(imposto, "ICMS");
    const ipi = primeiro(imposto, "IPI");
    if (!prod) continue;
    const nItem = Number.parseInt(det.getAttribute("nItem") || String(i + 1), 10) || i + 1;
    const cst =
      texto(icms, "CSOSN") ||
      texto(icms, "CST") ||
      "";
    itens.push({
      nItem,
      cProd: texto(prod, "cProd"),
      xProd: texto(prod, "xProd"),
      ncm: texto(prod, "NCM"),
      cst,
      cfop: texto(prod, "CFOP"),
      uCom: texto(prod, "uCom") || "UN",
      qCom: texto(prod, "qCom"),
      vUnCom: texto(prod, "vUnCom"),
      vProd: texto(prod, "vProd"),
      vBc: texto(icms, "vBC"),
      vIcms: texto(icms, "vICMS"),
      vIpi: texto(ipi, "vIPI"),
      pIcms: texto(icms, "pICMS"),
      pIpi: texto(ipi, "pIPI"),
    });
  }

  const cnpj = texto(destEl, "CNPJ");
  const cpf = texto(destEl, "CPF");

  return {
    tpAmb: Number(texto(ide, "tpAmb")) || 2,
    tpNF: texto(ide, "tpNF") || "1",
    nNF: texto(ide, "nNF"),
    serie: texto(ide, "serie"),
    dhEmi: texto(ide, "dhEmi"),
    dhSaiEnt: texto(ide, "dhSaiEnt"),
    natOp: texto(ide, "natOp"),
    infCpl: texto(infAdic, "infCpl"),
    emit: {
      cnpj: texto(emit, "CNPJ"),
      xNome: texto(emit, "xNome"),
      xFant: texto(emit, "xFant"),
      ie: texto(emit, "IE"),
      ieST: texto(emit, "IEST"),
      ...enderEmit,
    },
    dest: {
      doc: cnpj || cpf,
      tipoDoc: cnpj ? "CNPJ" : cpf ? "CPF" : null,
      xNome: texto(destEl, "xNome"),
      ie: texto(destEl, "IE"),
      email: texto(destEl, "email"),
      ...enderDest,
    },
    itens,
    totais: {
      vBC: texto(icmsTot, "vBC"),
      vICMS: texto(icmsTot, "vICMS"),
      vBCST: texto(icmsTot, "vBCST"),
      vST: texto(icmsTot, "vST"),
      vProd: texto(icmsTot, "vProd"),
      vFrete: texto(icmsTot, "vFrete"),
      vSeg: texto(icmsTot, "vSeg"),
      vDesc: texto(icmsTot, "vDesc"),
      vOutro: texto(icmsTot, "vOutro"),
      vIPI: texto(icmsTot, "vIPI"),
      vNF: texto(icmsTot, "vNF"),
    },
    transp: {
      modFrete: texto(transp, "modFrete"),
      xNome: texto(transporta, "xNome"),
      cnpj: texto(transporta, "CNPJ") || texto(transporta, "CPF"),
      ie: texto(transporta, "IE"),
      xEnder: texto(transporta, "xEnder"),
      xMun: texto(transporta, "xMun"),
      uf: texto(transporta, "UF"),
      qVol: texto(vol, "qVol"),
      esp: texto(vol, "esp"),
      marca: texto(vol, "marca"),
      nVol: texto(vol, "nVol"),
      pesoL: texto(vol, "pesoL"),
      pesoB: texto(vol, "pesoB"),
    },
  };
}
