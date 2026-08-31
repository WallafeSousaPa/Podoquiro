import { DOMParser } from "@xmldom/xmldom";

export type NfeEndereco = {
  xLgr: string;
  nro: string;
  xCpl: string;
  xBairro: string;
  xMun: string;
  uf: string;
  cep: string;
  fone: string;
};

export type NfeItemParsed = {
  nItem: number;
  cProd: string;
  cEan: string | null;
  xProd: string;
  ncm: string;
  cest: string | null;
  cfop: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
  vFrete: number | null;
  origem: number;
  csosn: string | null;
};

export type NfeXmlParsed = {
  chaveAcesso: string;
  modelo: number;
  serie: number;
  numeroNf: number;
  dhEmissao: string | null;
  naturezaOperacao: string;
  emit: {
    cnpj: string;
    xNome: string;
    xFant: string;
    ie: string;
    uf: string;
    xMun: string;
    fone: string;
    endereco: string;
  };
  dest: {
    doc: string;
    tipoDoc: "CPF" | "CNPJ" | null;
    xNome: string;
    uf: string;
    xMun: string;
    email: string;
    endereco: string;
  } | null;
  totais: {
    vProd: number;
    vFrete: number;
    vNF: number;
  };
  itens: NfeItemParsed[];
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

function numero(raw: string): number {
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function eanValido(raw: string): string | null {
  const d = soDigitos(raw);
  if (d.length < 8 || d.length > 14) return null;
  return d;
}

function formatarEndereco(end: NfeEndereco): string {
  const linha1 = [end.xLgr, end.nro].filter(Boolean).join(", ");
  const partes = [
    linha1,
    end.xCpl,
    end.xBairro,
    [end.xMun, end.uf].filter(Boolean).join("/"),
    end.cep ? `CEP ${end.cep}` : "",
  ].filter((p) => p.trim() !== "");
  return partes.join(" — ");
}

function lerEndereco(parent: Element | null, tag: string): NfeEndereco {
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

export function parseNfeXml(xml: string): NfeXmlParsed {
  const trimmed = xml.trim();
  if (!trimmed) {
    throw new Error("XML vazio.");
  }

  const doc = new DOMParser().parseFromString(trimmed, "text/xml");
  const docEl = doc as unknown as Document;

  const parseError = docEl.getElementsByTagName("parsererror")[0];
  if (parseError) {
    throw new Error("XML inválido.");
  }

  const infNFe = (docEl.getElementsByTagName("infNFe")[0] ?? null) as unknown as
    | Element
    | null;
  if (!infNFe) {
    throw new Error("Arquivo não é uma NF-e válida (infNFe ausente).");
  }

  const ide = primeiro(infNFe, "ide");
  const modelo = Number.parseInt(texto(ide, "mod") || "0", 10);
  if (modelo !== 55) {
    throw new Error("Somente NF-e modelo 55 (mercadoria) pode ser importada.");
  }

  const prot = (docEl.getElementsByTagName("protNFe")[0] ?? null) as unknown as
    | Element
    | null;
  const infProt = primeiro(prot, "infProt");
  const idAttr = infNFe.getAttribute("Id") ?? "";
  const chaveRaw =
    texto(infProt, "chNFe") || idAttr.replace(/^NFe/i, "") || "";
  const chaveAcesso = soDigitos(chaveRaw);
  if (chaveAcesso.length !== 44) {
    throw new Error("Chave de acesso da NF-e inválida.");
  }

  const numeroNf = Number.parseInt(texto(ide, "nNF") || "0", 10);
  if (!Number.isFinite(numeroNf) || numeroNf <= 0) {
    throw new Error("Número da NF-e inválido.");
  }

  const serie = Number.parseInt(texto(ide, "serie") || "1", 10) || 1;
  const dhEmissao = texto(ide, "dhEmi") || null;

  const emit = primeiro(infNFe, "emit");
  const enderEmit = lerEndereco(emit, "enderEmit");
  const destEl = primeiro(infNFe, "dest");
  const enderDest = lerEndereco(destEl, "enderDest");

  const destCnpj = soDigitos(texto(destEl, "CNPJ"));
  const destCpf = soDigitos(texto(destEl, "CPF"));
  let dest: NfeXmlParsed["dest"] = null;
  if (destEl) {
    dest = {
      doc: destCnpj || destCpf,
      tipoDoc: destCnpj ? "CNPJ" : destCpf ? "CPF" : null,
      xNome: texto(destEl, "xNome"),
      uf: enderDest.uf,
      xMun: enderDest.xMun,
      email: texto(destEl, "email"),
      endereco: formatarEndereco(enderDest),
    };
  }

  const total = primeiro(infNFe, "total");
  const icmsTot = primeiro(total, "ICMSTot");

  const itens: NfeItemParsed[] = [];
  const dets = infNFe.getElementsByTagName("det");
  for (let i = 0; i < dets.length; i++) {
    const det = dets[i] as unknown as Element;
    const prod = primeiro(det, "prod");
    if (!prod) continue;

    const nItemAttr = det.getAttribute("nItem");
    const nItem = Number.parseInt(nItemAttr || String(i + 1), 10) || i + 1;
    const xProd = texto(prod, "xProd").trim();
    if (!xProd) continue;

    const imposto = primeiro(det, "imposto");
    const origRaw = texto(imposto, "orig");
    const origem = Number.parseInt(origRaw || "0", 10);
    const csosnRaw = texto(imposto, "CSOSN").replace(/\D/g, "").slice(0, 3);

    const ncm = soDigitos(texto(prod, "NCM")).slice(0, 8);
    const cestDigits = soDigitos(texto(prod, "CEST")).slice(0, 7);
    const uCom = (texto(prod, "uCom") || "UN").trim().slice(0, 10) || "UN";

    itens.push({
      nItem,
      cProd: texto(prod, "cProd").trim(),
      cEan: eanValido(texto(prod, "cEAN")),
      xProd,
      ncm,
      cest: cestDigits.length === 7 ? cestDigits : null,
      cfop: soDigitos(texto(prod, "CFOP")).slice(0, 4),
      uCom,
      qCom: numero(texto(prod, "qCom")),
      vUnCom: numero(texto(prod, "vUnCom")),
      vProd: numero(texto(prod, "vProd")),
      vFrete: texto(prod, "vFrete") === "" ? null : numero(texto(prod, "vFrete")),
      origem: Number.isFinite(origem) && origem >= 0 && origem <= 8 ? origem : 0,
      csosn: csosnRaw.length === 3 ? csosnRaw : null,
    });
  }

  if (itens.length === 0) {
    throw new Error("A NF-e não possui itens de produto.");
  }

  return {
    chaveAcesso,
    modelo,
    serie,
    numeroNf,
    dhEmissao,
    naturezaOperacao: texto(ide, "natOp"),
    emit: {
      cnpj: soDigitos(texto(emit, "CNPJ")).slice(0, 14),
      xNome: texto(emit, "xNome"),
      xFant: texto(emit, "xFant"),
      ie: texto(emit, "IE"),
      uf: enderEmit.uf,
      xMun: enderEmit.xMun,
      fone: enderEmit.fone,
      endereco: formatarEndereco(enderEmit),
    },
    dest,
    totais: {
      vProd: numero(texto(icmsTot, "vProd")),
      vFrete: numero(texto(icmsTot, "vFrete")),
      vNF: numero(texto(icmsTot, "vNF")),
    },
    itens,
  };
}

export function normalizarNomeProduto(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function formatarCnpjCpf(doc: string | null | undefined, tipo?: string | null): string {
  const d = soDigitos(doc ?? "");
  if (tipo === "CPF" || d.length === 11) {
    if (d.length !== 11) return doc ?? "—";
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return doc?.trim() || "—";
}
