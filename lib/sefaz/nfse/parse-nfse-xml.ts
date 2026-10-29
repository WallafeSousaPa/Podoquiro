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

const MUNICIPIOS: Record<string, string> = {
  "1501402": "Belém / PA",
  "1500602": "Altamira / PA",
  "1500800": "Ananindeua / PA",
  "1501303": "Barcarena / PA",
  "1504208": "Marabá / PA",
  "1506807": "Santarém / PA",
};

function municipioIbge(cMun: string, nomeXml = ""): string {
  const c = cMun.replace(/\D/g, "").padStart(7, "0").slice(-7);
  if (nomeXml) return nomeXml;
  return MUNICIPIOS[c] || (c.length === 7 ? `IBGE ${c}` : "");
}

function descTpAmb(v: string): string {
  if (v === "2") return "Homologação";
  if (v === "1") return "Produção";
  return v;
}

function descAmbGer(v: string): string {
  if (v === "1") return "Sefin Nacional";
  if (v === "2") return "Sefin Municipal";
  return v || "Sefin Municipal";
}

function descTpEmit(v: string): string {
  if (v === "1") return "Prestador";
  if (v === "2") return "Tomador";
  if (v === "3") return "Intermediário";
  return v || "Prestador";
}

function descCStat(v: string): string {
  if (v === "100" || v === "101") return "NFS-e autorizada";
  if (!v) return "NFS-e autorizada";
  return v;
}

function descFin(v: string): string {
  if (v === "0" || !v) return "NFS-e regular";
  if (v === "1") return "NFS-e de crédito";
  if (v === "2") return "NFS-e de débito";
  return v;
}

function descOpSimp(v: string): string {
  if (v === "1") return "Não Optante";
  if (v === "2") return "Optante - MEI";
  if (v === "3") return "Optante - ME/EPP";
  return v;
}

function descRegApSn(v: string): string {
  if (v === "1") {
    return "Regime de apuração dos tributos federais e municipal pelo Simples Nacional";
  }
  if (v === "2") return "Regime de apuração dos tributos federais pelo Simples Nacional";
  if (v === "3") return "Regime de apuração do ISSQN pelo Simples Nacional";
  return v;
}

function descTribIssqn(v: string): string {
  if (v === "1") return "Operação tributável";
  if (v === "2") return "Imunidade";
  if (v === "3") return "Exportação de serviço";
  if (v === "4") return "Não incidência";
  return v;
}

function descRetIssqn(v: string): string {
  if (v === "1") return "Não retido";
  if (v === "2") return "Retido pelo tomador";
  if (v === "3") return "Retido pelo intermediário";
  return v;
}

function descRegEsp(v: string): string {
  if (v === "0" || !v) return "Nenhum";
  if (v === "1") return "Ato Cooperado";
  if (v === "2") return "Estimativa";
  if (v === "3") return "Sociedade de Profissionais";
  if (v === "4") return "Cooperativa";
  if (v === "5") return "Microempresário Individual (MEI)";
  if (v === "6") return "Microempresa ou EPP";
  return v;
}

function fmtEndereco(blocoEnd: string): string {
  const parts = [
    tag(blocoEnd, "xLgr"),
    tag(blocoEnd, "nro"),
    tag(blocoEnd, "xCpl"),
    tag(blocoEnd, "xBairro"),
  ].filter(Boolean);
  return parts.join(", ");
}

function fmtCep(cep: string): string {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return cep;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export type DadosDanfse = {
  chave: string;
  chave50: string;
  numero: string;
  serie: string;
  nDps: string;
  competencia: string;
  dhEmi: string;
  dhProc: string;
  codigoVerificacao: string;
  municipioEmi: string;
  ufEmi: string;
  ambGer: string;
  tpAmb: string;
  tpEmit: string;
  situacao: string;
  finalidade: string;
  homologacao: boolean;
  prestadorNome: string;
  prestadorCnpj: string;
  prestadorIm: string;
  prestadorFone: string;
  prestadorEmail: string;
  prestadorEndereco: string;
  prestadorMunicipio: string;
  prestadorIbgeCep: string;
  simplesNacional: string;
  regimeApuracaoSn: string;
  tomadorNome: string;
  tomadorDoc: string;
  tomadorIm: string;
  tomadorFone: string;
  tomadorEmail: string;
  tomadorEndereco: string;
  tomadorMunicipio: string;
  tomadorIbgeCep: string;
  destinatarioProprioTomador: boolean;
  cTribNac: string;
  cTribMun: string;
  cNBS: string;
  localPrestacao: string;
  xTrib: string;
  discriminacao: string;
  tribIssqn: string;
  munIncidencia: string;
  regimeEsp: string;
  tpRetIssqn: string;
  vBcIssqn: string;
  pAliqIssqn: string;
  vIssqn: string;
  cst: string;
  cClassTrib: string;
  cIndOp: string;
  valor: string;
  vLiq: string;
  vDescIncond: string;
  vDescCond: string;
  vTotalRet: string;
  vIbsCbs: string;
  vTotNf: string;
  infoCompl: string;
};

export function extrairDadosDanfse(xml: string, chaveFallback = ""): DadosDanfse {
  const inf = bloco(xml, "infNFSe") || xml;
  const dps = bloco(xml, "infDPS") || xml;
  const emit = bloco(xml, "emit") || bloco(dps, "prest");
  const prest = bloco(dps, "prest") || emit;
  const toma = bloco(dps, "toma") || bloco(xml, "toma");
  const endPrest = bloco(emit, "enderNac") || bloco(prest, "end");
  const endToma = bloco(toma, "end");
  const endNacToma = bloco(endToma, "endNac") || endToma;
  const serv = bloco(dps, "serv") || bloco(xml, "serv");
  const valoresNf = bloco(inf, "valores");
  const valoresDps = bloco(dps, "valores");
  const tribMun = bloco(dps, "tribMun") || bloco(xml, "tribMun");
  const ibs = bloco(dps, "IBSCBS") || bloco(xml, "IBSCBS");
  const gIbs = bloco(ibs, "gIBSCBS");
  const totTrib = bloco(dps, "totTrib") || bloco(xml, "totTrib");

  const idInf = inf.match(/\bId="(NFS[^"]+)"/i)?.[1] ?? chaveFallback;
  const chave = idInf.toUpperCase();
  const chave50 = chave.replace(/^NFS/i, "").replace(/\D/g, "");

  const cMunEmi = tag(endPrest, "cMun") || tag(xml, "cLocEmi") || "1501402";
  const ufEmi = tag(endPrest, "UF") || "PA";
  const xLocEmi = tag(xml, "xLocEmi");
  const cMunToma = tag(endNacToma, "cMun");
  const cepPrest = tag(endPrest, "CEP");
  const cepToma = tag(endNacToma, "CEP");
  const tpAmb = tag(dps, "tpAmb") || "1";
  const indDest = tag(ibs, "indDest");

  const vServ = tag(valoresDps, "vServ") || tag(xml, "vServ");
  const vLiq = tag(valoresNf, "vLiq") || vServ;
  const vFed = tag(totTrib, "vTotTribFed") || tag(totTrib, "pTotTribFed");
  const vEst = tag(totTrib, "vTotTribEst") || tag(totTrib, "pTotTribEst");
  const vMun = tag(totTrib, "vTotTribMun") || tag(totTrib, "pTotTribMun");
  const totAprox = `Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: ${vFed || "0,00"} ; Estaduais: ${vEst || "0,00"} ; Municipais: ${vMun || "0,00"}`;

  return {
    chave,
    chave50,
    numero: tag(xml, "nNFSe"),
    serie: tag(dps, "serie"),
    nDps: tag(dps, "nDPS"),
    competencia: tag(dps, "dCompet"),
    dhEmi: tag(dps, "dhEmi"),
    dhProc: tag(xml, "dhProc") || tag(dps, "dhEmi"),
    codigoVerificacao: tag(xml, "cVerif"),
    municipioEmi: municipioIbge(cMunEmi, xLocEmi),
    ufEmi,
    ambGer: descAmbGer(tag(xml, "ambGer") || "2"),
    tpAmb: descTpAmb(tpAmb),
    tpEmit: descTpEmit(tag(dps, "tpEmit")),
    situacao: descCStat(tag(xml, "cStat")),
    finalidade: descFin(tag(ibs, "finNFSe")),
    homologacao: tpAmb === "2",
    prestadorNome: tag(emit, "xNome") || tag(prest, "xNome") || tag(emit, "xFant"),
    prestadorCnpj: tag(prest, "CNPJ") || tag(emit, "CNPJ"),
    prestadorIm: tag(prest, "IM") || tag(emit, "IM"),
    prestadorFone: tag(prest, "fone") || tag(emit, "fone"),
    prestadorEmail: tag(prest, "email") || tag(emit, "email"),
    prestadorEndereco: fmtEndereco(endPrest),
    prestadorMunicipio: municipioIbge(cMunEmi, xLocEmi),
    prestadorIbgeCep: [cMunEmi, cepPrest ? fmtCep(cepPrest) : ""].filter(Boolean).join(" / "),
    simplesNacional: descOpSimp(tag(dps, "opSimpNac")),
    regimeApuracaoSn: descRegApSn(tag(dps, "regApTribSN")),
    tomadorNome: tag(toma, "xNome"),
    tomadorDoc: tag(toma, "CPF") || tag(toma, "CNPJ"),
    tomadorIm: tag(toma, "IM"),
    tomadorFone: tag(toma, "fone"),
    tomadorEmail: tag(toma, "email"),
    tomadorEndereco: fmtEndereco(endToma),
    tomadorMunicipio: municipioIbge(cMunToma),
    tomadorIbgeCep: [cMunToma, cepToma ? fmtCep(cepToma) : ""].filter(Boolean).join(" / "),
    destinatarioProprioTomador: indDest !== "1" && indDest !== "2",
    cTribNac: tag(serv, "cTribNac"),
    cTribMun: tag(serv, "cTribMun") || tag(xml, "cTribMun"),
    cNBS: tag(serv, "cNBS"),
    localPrestacao: tag(xml, "xLocPrestacao") || municipioIbge(tag(serv, "cLocPrestacao") || cMunEmi, xLocEmi),
    xTrib: tag(xml, "xTribMun") || tag(xml, "xTribNac"),
    discriminacao: tag(serv, "xDescServ") || tag(xml, "xDescServ"),
    tribIssqn: descTribIssqn(tag(tribMun, "tribISSQN")),
    munIncidencia: tag(xml, "xLocIncid") || municipioIbge(tag(xml, "cLocIncid") || cMunEmi),
    regimeEsp: descRegEsp(tag(dps, "regEspTrib")),
    tpRetIssqn: descRetIssqn(tag(tribMun, "tpRetISSQN")),
    vBcIssqn: tag(valoresNf, "vBC"),
    pAliqIssqn: tag(valoresNf, "pAliqAplic"),
    vIssqn: tag(valoresNf, "vISSQN"),
    cst: tag(gIbs, "CST") || tag(ibs, "CST"),
    cClassTrib: tag(gIbs, "cClassTrib") || tag(ibs, "cClassTrib"),
    cIndOp: tag(ibs, "cIndOp"),
    valor: vServ,
    vLiq,
    vDescIncond: tag(valoresDps, "vDescIncond"),
    vDescCond: tag(valoresDps, "vDescCond"),
    vTotalRet: tag(valoresNf, "vTotalRet"),
    vIbsCbs: tag(xml, "vIBSTot") || tag(xml, "vCBS") || "0.00",
    vTotNf: tag(xml, "vTotNF") || vLiq || vServ,
    infoCompl: totAprox,
  };
}
