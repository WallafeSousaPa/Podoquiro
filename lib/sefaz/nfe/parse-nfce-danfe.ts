import { DOMParser } from "@xmldom/xmldom";

export type DanfeItem = {
  cProd: string;
  xProd: string;
  qCom: string;
  uCom: string;
  vUnCom: string;
  vProd: string;
};

export type DanfeNfceDados = {
  tpAmb: number;
  nNF: string;
  serie: string;
  dhEmi: string;
  emit: {
    cnpj: string;
    xNome: string;
    xFant: string;
    ie: string;
    xLgr: string;
    nro: string;
    xCpl: string;
    xBairro: string;
    xMun: string;
    uf: string;
    cep: string;
    fone: string;
  };
  dest: { doc: string; tipoDoc: "CPF" | "CNPJ" | null; xNome: string } | null;
  itens: DanfeItem[];
  vProd: string;
  vDesc: string;
  vNF: string;
  pagamentos: { tPag: string; vPag: string }[];
  qrCode: string;
  urlChave: string;
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

/** Extrai os dados necessários para montar o DANFE-NFC-e a partir do XML da NFC-e (modelo 65). */
export function extrairDanfeNfceDoXml(xmlNfce: string): DanfeNfceDados {
  const doc = new DOMParser().parseFromString(xmlNfce, "text/xml");
  const docEl = doc as unknown as Document;
  const infNFe = (docEl.getElementsByTagName("infNFe")[0] ?? null) as unknown as Element | null;
  if (!infNFe) throw new Error("XML da NFC-e sem infNFe.");

  const ide = primeiro(infNFe, "ide");
  const emit = primeiro(infNFe, "emit");
  const enderEmit = primeiro(emit, "enderEmit");
  const destEl = primeiro(infNFe, "dest");
  const total = primeiro(infNFe, "total");
  const icmsTot = primeiro(total, "ICMSTot");
  const supl = primeiro(infNFe, "infNFeSupl");

  const itens: DanfeItem[] = [];
  const dets = infNFe.getElementsByTagName("det");
  for (let i = 0; i < dets.length; i++) {
    const det = dets[i] as unknown as Element;
    const prod = primeiro(det, "prod");
    if (!prod) continue;
    itens.push({
      cProd: texto(prod, "cProd"),
      xProd: texto(prod, "xProd"),
      qCom: texto(prod, "qCom"),
      uCom: texto(prod, "uCom"),
      vUnCom: texto(prod, "vUnCom"),
      vProd: texto(prod, "vProd"),
    });
  }

  const pagamentos: { tPag: string; vPag: string }[] = [];
  const detPags = (primeiro(infNFe, "pag")?.getElementsByTagName("detPag")) ?? null;
  if (detPags) {
    for (let i = 0; i < detPags.length; i++) {
      const dp = detPags[i] as unknown as Element;
      pagamentos.push({ tPag: texto(dp, "tPag"), vPag: texto(dp, "vPag") });
    }
  }

  let dest: DanfeNfceDados["dest"] = null;
  if (destEl) {
    const cnpj = texto(destEl, "CNPJ");
    const cpf = texto(destEl, "CPF");
    dest = {
      doc: cnpj || cpf,
      tipoDoc: cnpj ? "CNPJ" : cpf ? "CPF" : null,
      xNome: texto(destEl, "xNome"),
    };
  }

  return {
    tpAmb: Number(texto(ide, "tpAmb")) || 2,
    nNF: texto(ide, "nNF"),
    serie: texto(ide, "serie"),
    dhEmi: texto(ide, "dhEmi"),
    emit: {
      cnpj: texto(emit, "CNPJ"),
      xNome: texto(emit, "xNome"),
      xFant: texto(emit, "xFant"),
      ie: texto(emit, "IE"),
      xLgr: texto(enderEmit, "xLgr"),
      nro: texto(enderEmit, "nro"),
      xCpl: texto(enderEmit, "xCpl"),
      xBairro: texto(enderEmit, "xBairro"),
      xMun: texto(enderEmit, "xMun"),
      uf: texto(enderEmit, "UF"),
      cep: texto(enderEmit, "CEP"),
      fone: texto(enderEmit, "fone"),
    },
    dest,
    itens,
    vProd: texto(icmsTot, "vProd"),
    vDesc: texto(icmsTot, "vDesc"),
    vNF: texto(icmsTot, "vNF"),
    pagamentos,
    qrCode: texto(supl, "qrCode"),
    urlChave: texto(supl, "urlChave"),
  };
}
