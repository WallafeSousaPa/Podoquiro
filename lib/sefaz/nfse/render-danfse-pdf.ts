import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { DadosDanfse } from "./parse-nfse-xml";

const CINZA = { r: 242, g: 242, b: 242 };
const PRETO = { r: 0, g: 0, b: 0 };
const VERDE = { r: 0, g: 133, b: 66 };

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

function corte(s: string, max: number): string {
  const t = dash(s);
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 3))}...`;
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

export async function renderDanfsePdfBuffer(d: DadosDanfse): Promise<Buffer> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageW = 210;
  const pageH = 297;

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

  const tituloBloco = (texto: string, x: number, yy: number, w: number, h = cm(0.63)) => {
    fillCinza(x, yy, w, h);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text(texto.toUpperCase(), x + 1.2, yy + h * 0.68);
  };

  const labelCampo = (texto: string, x: number, yy: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(0, 0, 0);
    doc.text(texto, x + 1, yy + 3.2);
  };

  const valorCampo = (texto: string, x: number, yy: number, maxW: number, size = 7) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
    const linhas = doc.splitTextToSize(dash(texto), maxW - 2) as string[];
    doc.text(linhas.slice(0, 3), x + 1, yy + 6.4);
  };

  const celula = (
    x: number,
    yy: number,
    w: number,
    h: number,
    label: string,
    valor: string,
    opts?: { cinza?: boolean; labelCaps?: boolean },
  ) => {
    box(x, yy, w, h, opts?.cinza);
    if (opts?.labelCaps) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text(label.toUpperCase(), x + 1, yy + 3.4);
    } else {
      labelCampo(label, x, yy);
    }
    valorCampo(valor, x, yy, w);
  };

  /* Cabeçalho */
  const hCab = cm(1.16);
  box(x0, y, wPag, hCab);
  doc.setFillColor(VERDE.r, VERDE.g, VERDE.b);
  doc.rect(cm(0.49), cm(0.44), cm(4.0), cm(0.85), "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("NFS-e", cm(0.49) + cm(2.0), cm(0.44) + 6.2, { align: "center" });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.text("DANFSe v2.0", x0 + cm(10.2), y + 5.2, { align: "center" });
  doc.setFontSize(9);
  doc.text("Documento Auxiliar da NFS-e", x0 + cm(10.2), y + 9.2, { align: "center" });
  if (d.homologacao) {
    doc.setTextColor(200, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("NFS-e SEM VALIDADE JURÍDICA", x0 + cm(10.2), y + 12.4, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  const xMun = cm(15.62);
  const wMun = cm(5.09);
  box(xMun, y, wMun, hCab, true);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Município: ${corte(d.municipioEmi || "Belém / PA", 28)}`, xMun + 1.2, y + 4.4);
  doc.setFontSize(6);
  doc.text(dash(d.ambGer), xMun + 1.2, y + 7.6);
  doc.text(dash(d.tpAmb), xMun + 1.2, y + 10.2);
  y += hCab;

  /* Dados da NFS-e + QR */
  const hDados = cm(2.84);
  box(x0, y, cm(15.3), hDados);
  const chaveTxt = chave50Fmt(d.chave50 || d.chave);
  celula(x0, y, cm(15.3), cm(0.77), "Chave de Acesso da NFS-e", chaveTxt, {
    labelCaps: true,
  });
  const y2 = y + cm(0.77);
  const col = cm(5.09);
  celula(x0, y2, col, cm(0.67), "Número da NFS-e", dash(d.numero), { labelCaps: true });
  celula(x0 + col, y2, col, cm(0.67), "Competência da NFS-e", fmtData(d.competencia), {
    labelCaps: true,
  });
  celula(x0 + col * 2, y2, col, cm(0.67), "Data e Hora da Emissão da NFS-e", fmtDataHora(d.dhProc), {
    labelCaps: true,
  });
  const y3 = y2 + cm(0.67);
  celula(x0, y3, col, cm(0.67), "Número da DPS", dash(d.nDps), { labelCaps: true });
  celula(x0 + col, y3, col, cm(0.67), "Série da DPS", dash(d.serie), { labelCaps: true });
  celula(x0 + col * 2, y3, col, cm(0.67), "Data e Hora da Emissão da DPS", fmtDataHora(d.dhEmi), {
    labelCaps: true,
  });
  const y4 = y3 + cm(0.67);
  celula(x0, y4, col, cm(0.67), "Emitente da NFS-e", dash(d.tpEmit), {
    cinza: true,
    labelCaps: true,
  });
  celula(x0 + col, y4, col, cm(0.67), "Situação da NFS-e", dash(d.situacao), { labelCaps: true });
  celula(x0 + col * 2, y4, col, cm(0.67), "Finalidade", dash(d.finalidade), { labelCaps: true });

  const qrX = cm(17.48);
  const qrY = cm(1.67);
  const qrS = cm(1.52);
  const chaveQ = soDigitos(d.chave50 || d.chave);
  const qrUrl = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chaveQ}`;
  try {
    const qrData = await QRCode.toDataURL(qrUrl, {
      margin: 0,
      width: 180,
      errorCorrectionLevel: "M",
    });
    doc.addImage(qrData, "PNG", qrX, qrY, qrS, qrS);
  } catch {
    box(qrX, qrY, qrS, qrS);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  const qrLegenda = doc.splitTextToSize(
    "A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e",
    cm(4.6),
  ) as string[];
  doc.text(qrLegenda, cm(15.8), cm(3.36) + 2.2);
  y += hDados;

  const hLin = cm(0.63);
  const w1 = col;
  const w2 = cm(10.19);

  /* Prestador */
  tituloBloco("Prestador / Fornecedor", x0, y, w1);
  celula(x0 + w1, y, w1, hLin, "CNPJ / CPF / NIF", fmtDoc(d.prestadorCnpj));
  celula(x0 + w1 * 2, y, w1, hLin, "Indicador Municipal (Inscrição)", dash(d.prestadorIm));
  celula(x0 + w1 * 3, y, w1, hLin, "Telefone", dash(d.prestadorFone));
  y += hLin;
  celula(x0, y, w2, hLin, "Nome / Nome Empresarial", corte(d.prestadorNome, 77));
  celula(x0 + w2, y, w1, hLin, "Município / Sigla UF", dash(d.prestadorMunicipio));
  celula(x0 + w2 + w1, y, w1, hLin, "Código IBGE / CEP", dash(d.prestadorIbgeCep));
  y += hLin;
  celula(x0, y, w2, hLin, "Endereço", corte(d.prestadorEndereco, 77));
  celula(x0 + w2, y, w2, hLin, "E-mail", corte(d.prestadorEmail, 77));
  y += hLin;
  celula(x0, y, w1, hLin, "Simples Nacional na Data de Competência", corte(d.simplesNacional, 37));
  celula(x0 + w1, y, w2 + w1, hLin, "Regime de Apuração Tributária pelo SN", corte(d.regimeApuracaoSn, 77));
  y += hLin;

  /* Tomador */
  tituloBloco("Tomador / Adquirente", x0, y, w1);
  celula(x0 + w1, y, w1, hLin, "CNPJ / CPF / NIF", fmtDoc(d.tomadorDoc));
  celula(x0 + w1 * 2, y, w1, hLin, "Indicador Municipal (Inscrição)", dash(d.tomadorIm));
  celula(x0 + w1 * 3, y, w1, hLin, "Telefone", dash(d.tomadorFone));
  y += hLin;
  celula(x0, y, w2, hLin, "Nome / Nome Empresarial", corte(d.tomadorNome, 77));
  celula(x0 + w2, y, w1, hLin, "Município / Sigla UF", dash(d.tomadorMunicipio));
  celula(x0 + w2 + w1, y, w1, hLin, "Código IBGE / CEP", dash(d.tomadorIbgeCep));
  y += hLin;
  celula(x0, y, w2, hLin, "Endereço", corte(d.tomadorEndereco, 77));
  celula(x0 + w2, y, w2, hLin, "E-mail", corte(d.tomadorEmail, 77));
  y += hLin;

  /* Destinatário compacto */
  const hMin = cm(0.63);
  fillCinza(x0, y, wPag, hMin);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(
    d.destinatarioProprioTomador
      ? "O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO"
      : "DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e",
    x0 + 1.2,
    y + 4.2,
  );
  y += hMin;
  fillCinza(x0, y, wPag, hMin);
  doc.text("INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e", x0 + 1.2, y + 4.2);
  y += hMin;

  /* Serviço */
  tituloBloco("Serviço Prestado", x0, y, w1);
  celula(
    x0 + w1,
    y,
    w1,
    hLin,
    "Código de Tributação Nacional / Municipal",
    fmtTribNacMun(d.cTribNac, d.cTribMun),
  );
  celula(x0 + w1 * 2, y, w1, hLin, "Código da NBS", fmtNbs(d.cNBS));
  celula(x0 + w1 * 3, y, w1, hLin, "Local da Prestação / Sigla UF / País", corte(`${d.localPrestacao} / BR`, 42));
  y += hLin;
  if (d.xTrib) {
    box(x0, y, wPag, cm(0.38));
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(corte(d.xTrib, 167), x0 + 1, y + 2.8);
    y += cm(0.38);
  }
  const desc = dash(d.discriminacao);
  const descLinhas = doc.splitTextToSize(desc, wPag - 3) as string[];
  const hDesc = Math.max(cm(1.2), 5 + descLinhas.length * 3.2);
  box(x0, y, wPag, hDesc);
  labelCampo("Descrição do Serviço", x0, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(descLinhas.slice(0, 12), x0 + 1, y + 7);
  y += hDesc;

  /* ISSQN */
  tituloBloco("Tributação Municipal (ISSQN)", x0, y, w1);
  celula(x0 + w1, y, w2, hLin, "Município / Sigla UF / País da Incidência do ISSQN", corte(`${d.munIncidencia} / BR`, 42));
  celula(x0 + w1 + w2, y, w1, hLin, "Tipo de Tributação do ISSQN", dash(d.tribIssqn));
  y += hLin;
  celula(x0, y, w1, hLin, "Regime Especial de Tributação do ISSQN", corte(d.regimeEsp, 27));
  celula(x0 + w1, y, w1, hLin, "BC ISSQN", fmtBrl(d.vBcIssqn));
  celula(x0 + w1 * 2, y, w1, hLin, "Alíquota Aplicada", fmtPct(d.pAliqIssqn));
  celula(x0 + w1 * 3, y, w1, hLin, "Retenção do ISSQN", dash(d.tpRetIssqn));
  y += hLin;
  celula(x0, y, w1, hLin, "ISSQN Apurado", fmtBrl(d.vIssqn));
  y += hLin;

  /* Federal */
  tituloBloco("Tributação Federal (Exceto CBS)", x0, y, w1);
  celula(x0 + w1, y, w1, hLin, "IRRF", "-");
  celula(x0 + w1 * 2, y, w1, hLin, "Contribuição Previdenciária - Retida", "-");
  celula(x0 + w1 * 3, y, w1, hLin, "Contribuições Sociais - Retidas", "-");
  y += hLin;
  celula(x0, y, w1, hLin, "PIS - Débito Apuração Própria", "-");
  celula(x0 + w1, y, w1, hLin, "COFINS - Débito Apuração Própria", "-");
  celula(x0 + w1 * 2, y, w2, hLin, "Descrição Contrib. Sociais - Retidas", "PIS/COFINS/CSLL não retido");
  y += hLin;

  /* IBS/CBS */
  tituloBloco("Tributação IBS / CBS", x0, y, w1);
  celula(
    x0 + w1,
    y,
    w1,
    hLin,
    "CST / cClassTrib",
    d.cst || d.cClassTrib ? `${dash(d.cst)} / ${dash(d.cClassTrib)}` : "-",
  );
  celula(
    x0 + w1 * 2,
    y,
    w2,
    hLin,
    "Indicador de Operação / Município de Incidência",
    corte([d.cIndOp, d.munIncidencia].filter(Boolean).join(" / "), 56),
  );
  y += hLin;
  celula(x0, y, w1, hLin, "Valor Total Apurado - IBS", "0,00");
  celula(x0 + w1, y, w1, hLin, "Alíquota - CBS", "-");
  celula(x0 + w1 * 2, y, w1, hLin, "Alíquota Efetiva - CBS", "-");
  celula(x0 + w1 * 3, y, w1, hLin, "Valor Total Apurado - CBS", "0,00");
  y += hLin;

  /* Totais */
  const hTot = cm(0.67);
  tituloBloco("Valor Total da NFS-e", x0, y, w1, hTot);
  celula(x0 + w1, y, w1, hTot, "Valor da Operação / Serviço", fmtBrl(d.valor));
  celula(x0 + w1 * 2, y, w1, hTot, "Desconto Incondicionado", fmtBrl(d.vDescIncond));
  celula(x0 + w1 * 3, y, w1, hTot, "Desconto Condicionado", fmtBrl(d.vDescCond));
  y += hTot;
  celula(x0, y, w1, hTot, "Total das Retenções (ISSQN / Federais)", fmtBrl(d.vTotalRet));
  celula(x0 + w1, y, w1, hTot, "Valor Líquido da NFS-e", fmtBrl(d.vLiq || d.valor));
  celula(x0 + w1 * 2, y, w1, hTot, "Total do IBS/CBS", fmtBrl(d.vIbsCbs));
  celula(x0 + w1 * 3, y, w1, hTot, "Valor Líquido da NFS-e + IBS/CBS", fmtBrl(d.vTotNf || d.vLiq || d.valor), {
    cinza: true,
  });
  y += hTot;

  /* Informações complementares */
  const hInfo = Math.max(cm(1.6), pageH - y - 4);
  tituloBloco("Informações Complementares", x0, y, wPag, cm(0.39));
  y += cm(0.39);
  box(x0, y, wPag, hInfo - cm(0.39));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const infoLinhas = doc.splitTextToSize(dash(d.infoCompl), wPag - 3) as string[];
  doc.text(infoLinhas, x0 + 1, y + 4);

  return Buffer.from(doc.output("arraybuffer"));
}
