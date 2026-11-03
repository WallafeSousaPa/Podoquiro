import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { DadosDanfse } from "./parse-nfse-xml";

const CINZA = { r: 242, g: 242, b: 242 };
const PRETO = { r: 0, g: 0, b: 0 };
const VERDE = { r: 0, g: 133, b: 66 };

const FONT_LABEL = 7;
const FONT_VALOR = 8.5;
const LABEL_OFFSET = 3.6;
const LINE_H_LABEL = 3.1;
const LINE_H_VALOR = 3.7;
const GAP_LABEL_VALOR = 1.1;
const PAD_BOTTOM = 2.2;
const H_MIN = 11;

function cm(n: number): number {
  return n * 10;
}

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function fmtDoc(doc: string): string {
  const d = soDigitos(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return doc.trim() || "-";
}

function fmtBrl(v: string | number): string {
  if (v == null || v === "") return "-";
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return String(v) || "-";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: string): string {
  if (!v) return "-";
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return v;
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
}

function fmtDataHora(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}${m[6] ? `:${m[6]}` : ""}`;
  const d = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (d) return `${d[3]}/${d[2]}/${d[1]}`;
  return iso.trim() || "-";
}

function fmtData(iso: string): string {
  const d = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (d) return `${d[3]}/${d[2]}/${d[1]}`;
  return fmtDataHora(iso);
}

function dash(s: string | null | undefined): string {
  const t = String(s ?? "").trim();
  return t || "-";
}

function chave50Fmt(chave: string): string {
  const d = soDigitos(chave.replace(/^NFS/i, ""));
  return (d.match(/.{1,5}/g) ?? [d]).join(" ") || "-";
}

function fmtNbs(nbs: string): string {
  const d = soDigitos(nbs);
  if (d.length === 9) return `${d[0]}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7)}`;
  return dash(nbs);
}

function fmtTribNacMun(nac: string, mun: string): string {
  const n = soDigitos(nac);
  const m = soDigitos(mun);
  const nFmt = n.length === 6 ? `${n.slice(0, 2)}.${n.slice(2, 4)}.${n.slice(4)}` : dash(nac);
  return m ? `${nFmt} / ${m}` : nFmt;
}

type LogoEmpresa = {
  bytes: Uint8Array;
  formato: "JPEG" | "PNG";
  wMm: number;
  hMm: number;
};

function dimensoesJpeg(buf: Buffer): { pxW: number; pxH: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1]!;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const pxH = buf.readUInt16BE(i + 5);
      const pxW = buf.readUInt16BE(i + 7);
      if (pxW > 0 && pxH > 0) return { pxW, pxH };
    }
    i += 2 + Math.max(len, 2);
  }
  return null;
}

async function carregarLogoEmpresa(): Promise<LogoEmpresa | null> {
  try {
    const bytes = await readFile(join(process.cwd(), "public", "PodoquiroLogoHome.jpeg"));
    const dim = dimensoesJpeg(bytes);
    if (!dim) return null;
    const maxW = 32;
    const maxH = 20;
    const aspect = dim.pxW / dim.pxH;
    let wMm = maxW;
    let hMm = wMm / aspect;
    if (hMm > maxH) {
      hMm = maxH;
      wMm = hMm * aspect;
    }
    return { bytes: new Uint8Array(bytes), formato: "JPEG", wMm, hMm };
  } catch {
    return null;
  }
}

type Campo = {
  w: number;
  label: string;
  valor: string;
  cinza?: boolean;
  labelCaps?: boolean;
};

export async function renderDanfsePdfBuffer(d: DadosDanfse): Promise<Buffer> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageW = 210;
  const pageH = 297;
  const logo = await carregarLogoEmpresa();

  doc.setDrawColor(PRETO.r, PRETO.g, PRETO.b);
  doc.setLineWidth(0.35);
  doc.rect(1.6, 1.6, pageW - 3.2, pageH - 3.2);

  const x0 = cm(0.3);
  const wPag = cm(20.4);
  let y = cm(0.3);

  const strokeFino = () => {
    doc.setDrawColor(PRETO.r, PRETO.g, PRETO.b);
    doc.setLineWidth(0.18);
  };

  const fillCinza = (x: number, yy: number, w: number, h: number) => {
    doc.setFillColor(CINZA.r, CINZA.g, CINZA.b);
    doc.rect(x, yy, w, h, "F");
    strokeFino();
    doc.rect(x, yy, w, h);
  };

  const box = (x: number, yy: number, w: number, h: number, cinza = false) => {
    if (cinza) fillCinza(x, yy, w, h);
    else {
      strokeFino();
      doc.rect(x, yy, w, h);
    }
  };

  const quebrar = (texto: string, maxW: number, size: number, bold = false): string[] => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    return doc.splitTextToSize(dash(texto), Math.max(8, maxW - 2.6)) as string[];
  };

  const alturaCampo = (c: Campo): number => {
    const labelSize = c.labelCaps ? 7 : FONT_LABEL;
    const nLabel = Math.max(1, quebrar(c.label, c.w, labelSize, true).length);
    const nValor = Math.max(1, quebrar(c.valor, c.w, FONT_VALOR).length);
    const hLabel = nLabel * LINE_H_LABEL;
    const hValor = nValor * LINE_H_VALOR;
    return Math.max(H_MIN, LABEL_OFFSET - 1.4 + hLabel + GAP_LABEL_VALOR + hValor + PAD_BOTTOM);
  };

  const precisa = (h: number) => {
    if (y + h <= pageH - 5) return;
    doc.addPage();
    doc.setDrawColor(PRETO.r, PRETO.g, PRETO.b);
    doc.setLineWidth(0.35);
    doc.rect(1.6, 1.6, pageW - 3.2, pageH - 3.2);
    y = cm(0.3);
  };

  const desenharCampo = (x: number, yy: number, h: number, c: Campo) => {
    box(x, yy, c.w, h, c.cinza);
    const labelSize = c.labelCaps ? 7 : FONT_LABEL;
    const labelTxt = c.labelCaps ? c.label.toUpperCase() : c.label;
    const labels = quebrar(labelTxt, c.w, labelSize, true);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(labelSize);
    doc.setTextColor(0, 0, 0);
    doc.text(labels, x + 1.3, yy + LABEL_OFFSET);
    const yValor = yy + LABEL_OFFSET + (labels.length - 1) * LINE_H_LABEL + GAP_LABEL_VALOR + 2.4;
    const valores = quebrar(c.valor, c.w, FONT_VALOR);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(FONT_VALOR);
    doc.text(valores, x + 1.3, yValor);
  };

  const linha = (campos: Campo[]) => {
    const h = Math.max(H_MIN, ...campos.map(alturaCampo));
    precisa(h);
    let x = x0;
    for (const c of campos) {
      desenharCampo(x, y, h, c);
      x += c.w;
    }
    y += h;
  };

  const tituloBloco = (texto: string, wTitulo: number, campos: Campo[]) => {
    const h = Math.max(H_MIN, ...campos.map(alturaCampo));
    precisa(h);
    fillCinza(x0, y, wTitulo, h);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    const titLinhas = quebrar(texto.toUpperCase(), wTitulo, 8, true);
    const titH = titLinhas.length * 3.4;
    doc.text(titLinhas, x0 + 1.3, y + Math.max(5.2, (h - titH) / 2 + 3.4));
    let x = x0 + wTitulo;
    for (const c of campos) {
      desenharCampo(x, y, h, c);
      x += c.w;
    }
    y += h;
  };

  const faixa = (texto: string) => {
    const linhasTxt = quebrar(texto, wPag, 8, true);
    const h = Math.max(8, 4.2 + linhasTxt.length * 3.5);
    precisa(h);
    fillCinza(x0, y, wPag, h);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(linhasTxt, x0 + 1.4, y + 5);
    y += h;
  };

  /* Cabeçalho */
  const hCab = logo ? Math.max(22, logo.hMm + 5) : 18;
  box(x0, y, wPag, hCab);

  let xAposLogo = x0 + 2;
  if (logo) {
    try {
      doc.addImage(logo.bytes, logo.formato, x0 + 1.6, y + (hCab - logo.hMm) / 2, logo.wMm, logo.hMm);
      xAposLogo = x0 + 1.6 + logo.wMm + 2.2;
    } catch {
      xAposLogo = x0 + 2;
    }
  }

  const wNfs = 22;
  const hNfs = 9;
  const yNfs = y + (hCab - hNfs) / 2;
  doc.setFillColor(VERDE.r, VERDE.g, VERDE.b);
  doc.rect(xAposLogo, yNfs, wNfs, hNfs, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("NFS-e", xAposLogo + wNfs / 2, yNfs + 6.1, { align: "center" });

  const xMun = cm(15.62);
  const wMun = cm(5.09);
  const xTitulo = (xAposLogo + wNfs + xMun) / 2;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DANFSe v2.0", xTitulo, y + hCab / 2 - 2.2, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Documento Auxiliar da NFS-e", xTitulo, y + hCab / 2 + 2.4, { align: "center" });
  if (d.homologacao) {
    doc.setTextColor(200, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("NFS-e SEM VALIDADE JURÍDICA", xTitulo, y + hCab / 2 + 6.2, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  box(xMun, y, wMun, hCab, true);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const munLinhas = quebrar(`Município: ${dash(d.municipioEmi || "Belém / PA")}`, wMun, 8.5);
  doc.text(munLinhas, xMun + 1.4, y + 5.2);
  doc.setFontSize(7.5);
  const ambY = y + 5.2 + munLinhas.length * 3.6 + 1;
  doc.text(quebrar(dash(d.ambGer), wMun, 7.5), xMun + 1.4, ambY);
  doc.text(quebrar(dash(d.tpAmb), wMun, 7.5), xMun + 1.4, ambY + 3.8);
  y += hCab;

  /* Dados da NFS-e + QR */
  const wDados = cm(15.3);
  const wQr = wPag - wDados;
  const col = wDados / 3;
  const chaveTxt = chave50Fmt(d.chave50 || d.chave);
  const yDadosIni = y;

  linha([
    { w: wDados, label: "Chave de Acesso da NFS-e", valor: chaveTxt, labelCaps: true },
  ]);
  linha([
    { w: col, label: "Número da NFS-e", valor: dash(d.numero), labelCaps: true },
    { w: col, label: "Competência da NFS-e", valor: fmtData(d.competencia), labelCaps: true },
    {
      w: col,
      label: "Data e Hora da Emissão da NFS-e",
      valor: fmtDataHora(d.dhProc),
      labelCaps: true,
    },
  ]);
  linha([
    { w: col, label: "Número da DPS", valor: dash(d.nDps), labelCaps: true },
    { w: col, label: "Série da DPS", valor: dash(d.serie), labelCaps: true },
    {
      w: col,
      label: "Data e Hora da Emissão da DPS",
      valor: fmtDataHora(d.dhEmi),
      labelCaps: true,
    },
  ]);
  linha([
    { w: col, label: "Emitente da NFS-e", valor: dash(d.tpEmit), cinza: true, labelCaps: true },
    { w: col, label: "Situação da NFS-e", valor: dash(d.situacao), labelCaps: true },
    { w: col, label: "Finalidade", valor: dash(d.finalidade), labelCaps: true },
  ]);

  const hDados = y - yDadosIni;
  const qrS = Math.min(22, Math.max(16, hDados * 0.42));
  const qrX = x0 + wDados + (wQr - qrS) / 2;
  const qrY = yDadosIni + 2.5;
  box(x0 + wDados, yDadosIni, wQr, hDados);
  const chaveQ = soDigitos(d.chave50 || d.chave);
  const qrUrl = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chaveQ}`;
  try {
    const qrData = await QRCode.toDataURL(qrUrl, {
      margin: 0,
      width: 220,
      errorCorrectionLevel: "M",
    });
    doc.addImage(qrData, "PNG", qrX, qrY, qrS, qrS);
  } catch {
    box(qrX, qrY, qrS, qrS);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const qrLegenda = quebrar(
    "A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e",
    wQr,
    6.5,
  );
  doc.text(qrLegenda, x0 + wDados + 1.4, qrY + qrS + 4);

  const w1 = col;
  const w2 = w1 * 2;

  /* Prestador */
  tituloBloco("Prestador / Fornecedor", w1, [
    { w: w1, label: "CNPJ / CPF / NIF", valor: fmtDoc(d.prestadorCnpj) },
    { w: w1, label: "Indicador Municipal (Inscrição)", valor: dash(d.prestadorIm) },
    { w: w1, label: "Telefone", valor: dash(d.prestadorFone) },
  ]);
  linha([
    { w: w2, label: "Nome / Nome Empresarial", valor: dash(d.prestadorNome) },
    { w: w1, label: "Município / Sigla UF", valor: dash(d.prestadorMunicipio) },
    { w: w1, label: "Código IBGE / CEP", valor: dash(d.prestadorIbgeCep) },
  ]);
  linha([
    { w: w2, label: "Endereço", valor: dash(d.prestadorEndereco) },
    { w: w2, label: "E-mail", valor: dash(d.prestadorEmail) },
  ]);
  linha([
    { w: w1, label: "Simples Nacional na Data de Competência", valor: dash(d.simplesNacional) },
    { w: w2 + w1, label: "Regime de Apuração Tributária pelo SN", valor: dash(d.regimeApuracaoSn) },
  ]);

  /* Tomador */
  tituloBloco("Tomador / Adquirente", w1, [
    { w: w1, label: "CNPJ / CPF / NIF", valor: fmtDoc(d.tomadorDoc) },
    { w: w1, label: "Indicador Municipal (Inscrição)", valor: dash(d.tomadorIm) },
    { w: w1, label: "Telefone", valor: dash(d.tomadorFone) },
  ]);
  linha([
    { w: w2, label: "Nome / Nome Empresarial", valor: dash(d.tomadorNome) },
    { w: w1, label: "Município / Sigla UF", valor: dash(d.tomadorMunicipio) },
    { w: w1, label: "Código IBGE / CEP", valor: dash(d.tomadorIbgeCep) },
  ]);
  linha([
    { w: w2, label: "Endereço", valor: dash(d.tomadorEndereco) },
    { w: w2, label: "E-mail", valor: dash(d.tomadorEmail) },
  ]);

  faixa(
    d.destinatarioProprioTomador
      ? "O destinatário é o próprio tomador/adquirente da operação"
      : "Destinatário da operação não identificado na NFS-e",
  );
  faixa("Intermediário da operação não identificado na NFS-e");

  /* Serviço */
  tituloBloco("Serviço Prestado", w1, [
    {
      w: w1,
      label: "Código de Tributação Nacional / Municipal",
      valor: fmtTribNacMun(d.cTribNac, d.cTribMun),
    },
    { w: w1, label: "Código da NBS", valor: fmtNbs(d.cNBS) },
    {
      w: w1,
      label: "Local da Prestação / Sigla UF / País",
      valor: `${dash(d.localPrestacao)} / BR`,
    },
  ]);
  if (d.xTrib) {
    linha([{ w: wPag, label: "Descrição da tributação", valor: dash(d.xTrib) }]);
  }
  const desc = dash(d.discriminacao);
  const descLinhas = quebrar(desc, wPag, FONT_VALOR);
  const hDesc = Math.max(16, LABEL_OFFSET + GAP_LABEL_VALOR + descLinhas.length * LINE_H_VALOR + PAD_BOTTOM + 2);
  precisa(hDesc);
  box(x0, y, wPag, hDesc);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_LABEL);
  doc.text("Descrição do Serviço", x0 + 1.3, y + LABEL_OFFSET);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_VALOR);
  doc.text(descLinhas, x0 + 1.3, y + LABEL_OFFSET + LINE_H_LABEL + GAP_LABEL_VALOR + 1.2);
  y += hDesc;

  /* ISSQN */
  tituloBloco("Tributação Municipal (ISSQN)", w1, [
    {
      w: w2,
      label: "Município / Sigla UF / País da Incidência do ISSQN",
      valor: `${dash(d.munIncidencia)} / BR`,
    },
    { w: w1, label: "Tipo de Tributação do ISSQN", valor: dash(d.tribIssqn) },
  ]);
  linha([
    { w: w1, label: "Regime Especial de Tributação do ISSQN", valor: dash(d.regimeEsp) },
    { w: w1, label: "BC ISSQN", valor: fmtBrl(d.vBcIssqn) },
    { w: w1, label: "Alíquota Aplicada", valor: fmtPct(d.pAliqIssqn) },
    { w: w1, label: "Retenção do ISSQN", valor: dash(d.tpRetIssqn) },
  ]);
  linha([{ w: w1, label: "ISSQN Apurado", valor: fmtBrl(d.vIssqn) }]);

  /* Federal */
  tituloBloco("Tributação Federal (Exceto CBS)", w1, [
    { w: w1, label: "IRRF", valor: "-" },
    { w: w1, label: "Contribuição Previdenciária - Retida", valor: "-" },
    { w: w1, label: "Contribuições Sociais - Retidas", valor: "-" },
  ]);
  linha([
    { w: w1, label: "PIS - Débito Apuração Própria", valor: "-" },
    { w: w1, label: "COFINS - Débito Apuração Própria", valor: "-" },
    { w: w2, label: "Descrição Contrib. Sociais - Retidas", valor: "PIS/COFINS/CSLL não retido" },
  ]);

  /* IBS/CBS */
  tituloBloco("Tributação IBS / CBS", w1, [
    {
      w: w1,
      label: "CST / cClassTrib",
      valor: d.cst || d.cClassTrib ? `${dash(d.cst)} / ${dash(d.cClassTrib)}` : "-",
    },
    {
      w: w2,
      label: "Indicador de Operação / Município de Incidência",
      valor: [d.cIndOp, d.munIncidencia].filter(Boolean).join(" / ") || "-",
    },
  ]);
  linha([
    { w: w1, label: "Valor Total Apurado - IBS", valor: "0,00" },
    { w: w1, label: "Alíquota - CBS", valor: "-" },
    { w: w1, label: "Alíquota Efetiva - CBS", valor: "-" },
    { w: w1, label: "Valor Total Apurado - CBS", valor: "0,00" },
  ]);

  /* Totais */
  tituloBloco("Valor Total da NFS-e", w1, [
    { w: w1, label: "Valor da Operação / Serviço", valor: fmtBrl(d.valor) },
    { w: w1, label: "Desconto Incondicionado", valor: fmtBrl(d.vDescIncond) },
    { w: w1, label: "Desconto Condicionado", valor: fmtBrl(d.vDescCond) },
  ]);
  linha([
    { w: w1, label: "Total das Retenções (ISSQN / Federais)", valor: fmtBrl(d.vTotalRet) },
    { w: w1, label: "Valor Líquido da NFS-e", valor: fmtBrl(d.vLiq || d.valor) },
    { w: w1, label: "Total do IBS/CBS", valor: fmtBrl(d.vIbsCbs) },
    {
      w: w1,
      label: "Valor Líquido da NFS-e + IBS/CBS",
      valor: fmtBrl(d.vTotNf || d.vLiq || d.valor),
      cinza: true,
    },
  ]);

  /* Informações complementares */
  const infoLinhas = quebrar(dash(d.infoCompl), wPag, FONT_VALOR);
  const hTituloInfo = 8;
  const hInfoMin = Math.max(14, 6 + infoLinhas.length * LINE_H_VALOR);
  precisa(hTituloInfo + hInfoMin);
  fillCinza(x0, y, wPag, hTituloInfo);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("INFORMAÇÕES COMPLEMENTARES", x0 + 1.3, y + 5.4);
  y += hTituloInfo;
  const hInfo = Math.max(hInfoMin, Math.min(pageH - y - 4, pageH - y - 3));
  box(x0, y, wPag, hInfo);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_VALOR);
  doc.text(infoLinhas, x0 + 1.3, y + 5.2);

  return Buffer.from(doc.output("arraybuffer"));
}
