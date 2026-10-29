function unesc(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function bloco(xml: string, nome: string): string {
  const re = new RegExp(
    `<(?:\\w+:)?${nome}(?:\\s[^>]*)?>[\\s\\S]*?</(?:\\w+:)?${nome}>`,
    "i",
  );
  return xml.match(re)?.[0] ?? "";
}

function tag(xml: string, nome: string): string {
  const re = new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`, "i");
  const m = xml.match(re);
  return m?.[1] ? unesc(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")) : "";
}

export type DadosDanfse = {
  chave: string;
  numero: string;
  serie: string;
  competencia: string;
  dhEmi: string;
  codigoVerificacao: string;
  municipioEmi: string;
  prestadorNome: string;
  prestadorCnpj: string;
  prestadorIm: string;
  tomadorNome: string;
  tomadorDoc: string;
  tomadorEndereco: string;
  discriminacao: string;
  valor: string;
};

export function extrairDadosDanfse(xml: string, chaveFallback = ""): DadosDanfse {
  const emit = bloco(xml, "emit") || bloco(xml, "prest");
  const toma = bloco(xml, "toma");
  const endToma = bloco(toma, "end") || toma;
  const nro = tag(endToma, "nro");
  const lgr = tag(endToma, "xLgr");
  const bairro = tag(endToma, "xBairro");
  const cep = tag(endToma, "CEP");
  const endParts = [lgr, nro && nro !== "S/N" ? nro : nro, bairro, cep ? `CEP ${cep}` : ""]
    .map((s) => s.trim())
    .filter(Boolean);

  const idInf = xml.match(/\bId="(NFS[^"]+)"/i)?.[1] ?? "";

  return {
    chave: (idInf || chaveFallback).toUpperCase(),
    numero: tag(xml, "nNFSe") || tag(xml, "nDPS"),
    serie: tag(xml, "serie"),
    competencia: tag(xml, "dCompet"),
    dhEmi: tag(xml, "dhEmi") || tag(xml, "dhProc"),
    codigoVerificacao: tag(xml, "cVerif"),
    municipioEmi: tag(xml, "xLocEmi") || tag(xml, "xLocPrestacao") || "Belém / PA",
    prestadorNome: tag(emit, "xNome") || tag(emit, "xFant"),
    prestadorCnpj: tag(emit, "CNPJ"),
    prestadorIm: tag(emit, "IM"),
    tomadorNome: tag(toma, "xNome"),
    tomadorDoc: tag(toma, "CPF") || tag(toma, "CNPJ"),
    tomadorEndereco: endParts.join(" · "),
    discriminacao: tag(xml, "xDescServ"),
    valor: tag(xml, "vLiq") || tag(xml, "vServ"),
  };
}
