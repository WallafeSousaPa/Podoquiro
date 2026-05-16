/** Gera PDF do termo (modelo Podoquiro) + assinatura — apenas no browser. */

import {
  dimensoesCanvasAssinaturaTermo,
  exportarAssinaturaTermoJpeg,
} from "@/lib/client/canvas-assinatura-termo";
import { jsPDF } from "jspdf";
import type { DadosPacienteTermo, RodapeDataLocal, SegmentoTextoTermoPdf } from "@/lib/termo-consentimento/texto-podoquiro";
import {
  ALTURA_CAIXA_ASSINATURA_DIGITAL_PT,
  ESPACO_APOS_ASSINATURA_PACIENTE_PT,
  LARGURA_CAIXA_ASSINATURA_DIGITAL_PT,
  MARGEM_ASSINATURA_DIGITAL_PT,
  serializarMetadadosPosicaoAssinaturaDigital,
  TITULO_ASSINATURA_DIGITAL_PT,
} from "@/lib/termo-consentimento/layout-assinatura-digital-termo";
import {
  CLAUSULAS_TERMO_MODELO,
  formatarLinhaDataLocalTermo,
  RODAPE_CLINICA_PDF_LINHAS,
  segmentosIntroTermoModelo,
  SUBTITULO_TERMO,
  TEXTO_DECLARACAO_ASSINATURA_PLATAFORMA,
  textoCampoTabelaTermo,
  TITULO_TERMO_PRINCIPAL,
} from "@/lib/termo-consentimento/texto-podoquiro";

const LOGO_MAX_ANCHO = 118;
const LOGO_MAX_ALTO = 64;

/** Cores próximas ao modelo HTML (#Hex → 0-255) */
const C_TEXTO = { r: 74, g: 85, b: 104 }; // #4a5568
const C_TITULO = { r: 26, g: 54, b: 93 }; // #1a365d
const C_SUB = { r: 113, g: 128, b: 150 }; // #718096
const C_CLAUSULA_TIT = { r: 43, g: 108, b: 176 }; // #2b6cb0
const C_BORDA = { r: 226, g: 232, b: 240 }; // #e2e8f0
const C_LABEL_BG = { r: 247, g: 250, b: 252 }; // #f7fafc
const C_LABEL_TXT = { r: 74, g: 85, b: 104 };
const C_CAIXA_FOOT = { r: 235, g: 248, b: 255 }; // #ebf8ff
const C_CAIXA_BORDA = { r: 49, g: 130, b: 206 }; // #3182ce
const C_MUDO = { r: 92, g: 92, b: 92 };

function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function carregarLogoTermoPublico(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const url = `${window.location.origin}/IconePodoquiro.png`;
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    return blobParaDataUrl(await res.blob());
  } catch {
    return null;
  }
}

function tamanhoLogoNoPdf(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      if (!nw || !nh) {
        resolve({ w: LOGO_MAX_ANCHO, h: LOGO_MAX_ALTO });
        return;
      }
      const s = Math.min(LOGO_MAX_ANCHO / nw, LOGO_MAX_ALTO / nh, 1);
      resolve({ w: nw * s, h: nh * s });
    };
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = dataUrl;
  });
}

function renderizarSegmentosComQuebra(
  doc: jsPDF,
  segmentos: SegmentoTextoTermoPdf[],
  x0: number,
  yInicio: number,
  maxW: number,
  fontSize: number,
  lineHeight: number,
  rgb: { r: number; g: number; b: number },
): number {
  doc.setFontSize(fontSize);
  doc.setTextColor(rgb.r, rgb.g, rgb.b);
  let x = x0;
  let y = yInicio;
  const limite = x0 + maxW;

  for (const seg of segmentos) {
    doc.setFont("helvetica", seg.bold ? "bold" : "normal");
    const partes = seg.text.split(/(\s+)/);
    for (const p of partes) {
      if (p === "") continue;
      const largura = doc.getTextWidth(p);
      if (x + largura > limite && x > x0) {
        y += lineHeight;
        x = x0;
      }
      doc.text(p, x, y);
      x += largura;
    }
  }
  return y + lineHeight * 1.25;
}

function desenharTextoJustificado(
  doc: jsPDF,
  texto: string,
  x0: number,
  y0: number,
  maxW: number,
  fontSize: number,
  lineHeight: number,
  rgb: { r: number; g: number; b: number },
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(rgb.r, rgb.g, rgb.b);
  const linhas = doc.splitTextToSize(texto, maxW);
  let y = y0;
  for (let i = 0; i < linhas.length; i++) {
    const linha = (linhas[i] as string) ?? "";
    if (!linha.trim()) {
      y += lineHeight * 0.35;
      continue;
    }
    doc.text(linha, x0, y);
    y += lineHeight;
  }
  return y;
}

function garantirEspaco(doc: jsPDF, y: number, precisa: number, margin: number, pageH: number): number {
  if (y + precisa <= pageH - margin) return y;
  doc.addPage();
  return margin + 24;
}

/** Tabela de dados: duas linhas 2×2 (Paciente|CPF, Telefone|E-mail) e linha Endereço em largura total. */
function desenharTabelaPaciente(
  doc: jsPDF,
  pac: DadosPacienteTermo,
  margin: number,
  y0: number,
  maxW: number,
  fontSize: number,
  lineH: number,
): number {
  const nome = textoCampoTabelaTermo(pac.nomePaciente);
  const cpf = textoCampoTabelaTermo(pac.cpf);
  const tel = textoCampoTabelaTermo(pac.telefone);
  const em = textoCampoTabelaTermo(pac.email);
  const end = textoCampoTabelaTermo(pac.endereco);

  const w1 = maxW * 0.18;
  const w2 = maxW * 0.32;
  const w3 = maxW * 0.18;
  const w4 = maxW * 0.32;
  const x0 = margin;
  const x1 = x0 + w1;
  const x2 = x1 + w2;
  const x3 = x2 + w3;
  const pad = 7;
  const pageH = doc.internal.pageSize.getHeight();

  type LinhaDef = { l1: string; v1: string; l2: string; v2: string };
  const linhasDuplas: LinhaDef[] = [
    { l1: "Paciente:", v1: nome, l2: "CPF:", v2: cpf },
    { l1: "Telefone:", v1: tel, l2: "E-mail:", v2: em },
  ];

  let y = y0;
  doc.setDrawColor(C_BORDA.r, C_BORDA.g, C_BORDA.b);
  doc.setLineWidth(0.4);

  for (const row of linhasDuplas) {
    doc.setFontSize(fontSize);
    const innerW2 = w2 - pad * 2;
    const innerW4 = w4 - pad * 2;
    const linhasV1 = doc.splitTextToSize(row.v1, innerW2);
    const linhasV2 = doc.splitTextToSize(row.v2, innerW4);
    const blocos = Math.max(linhasV1.length, linhasV2.length, 1);
    const rowH = blocos * lineH + pad * 2;

    y = garantirEspaco(doc, y, rowH + 6, margin, pageH);

    doc.setFillColor(C_LABEL_BG.r, C_LABEL_BG.g, C_LABEL_BG.b);
    doc.rect(x0, y, w1, rowH, "F");
    doc.rect(x2, y, w3, rowH, "F");
    doc.setFillColor(255, 255, 255);
    doc.rect(x1, y, w2, rowH, "F");
    doc.rect(x3, y, w4, rowH, "F");

    doc.setDrawColor(C_BORDA.r, C_BORDA.g, C_BORDA.b);
    doc.rect(x0, y, w1 + w2 + w3 + w4, rowH, "S");
    doc.line(x1, y, x1, y + rowH);
    doc.line(x2, y, x2, y + rowH);
    doc.line(x3, y, x3, y + rowH);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(C_LABEL_TXT.r, C_LABEL_TXT.g, C_LABEL_TXT.b);
    doc.text(row.l1, x0 + pad, y + 12);
    doc.text(row.l2, x2 + pad, y + 12);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(C_TEXTO.r, C_TEXTO.g, C_TEXTO.b);
    let ty = y + 12;
    for (let i = 0; i < linhasV1.length; i++) {
      doc.text(linhasV1[i] as string, x1 + pad, ty);
      ty += lineH;
    }
    ty = y + 12;
    for (let i = 0; i < linhasV2.length; i++) {
      doc.text(linhasV2[i] as string, x3 + pad, ty);
      ty += lineH;
    }

    y += rowH;
  }

  const wValorEnd = w2 + w3 + w4;
  const innerWEnd = wValorEnd - pad * 2;
  doc.setFontSize(fontSize);
  const linhasEnd = doc.splitTextToSize(end, innerWEnd);
  const blocosEnd = Math.max(linhasEnd.length, 1);
  const rowHEnd = blocosEnd * lineH + pad * 2;

  y = garantirEspaco(doc, y, rowHEnd + 6, margin, pageH);

  doc.setFillColor(C_LABEL_BG.r, C_LABEL_BG.g, C_LABEL_BG.b);
  doc.rect(x0, y, w1, rowHEnd, "F");
  doc.setFillColor(255, 255, 255);
  doc.rect(x1, y, wValorEnd, rowHEnd, "F");

  doc.setDrawColor(C_BORDA.r, C_BORDA.g, C_BORDA.b);
  doc.rect(x0, y, w1 + wValorEnd, rowHEnd, "S");
  doc.line(x1, y, x1, y + rowHEnd);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(C_LABEL_TXT.r, C_LABEL_TXT.g, C_LABEL_TXT.b);
  doc.text("Endereço:", x0 + pad, y + 12);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(C_TEXTO.r, C_TEXTO.g, C_TEXTO.b);
  let tyEnd = y + 12;
  for (let i = 0; i < linhasEnd.length; i++) {
    doc.text(linhasEnd[i] as string, x1 + pad, tyEnd);
    tyEnd += lineH;
  }

  y += rowHEnd;

  return y + 4;
}

function desenharCaixaDeclaracao(
  doc: jsPDF,
  texto: string,
  margin: number,
  y0: number,
  maxW: number,
  fontSize: number,
  lineH: number,
): number {
  doc.setFontSize(fontSize);
  const linhas = doc.splitTextToSize(texto, maxW - 24);
  const hLinhas = linhas.length * lineH;
  const hBox = hLinhas + 24;
  let y = garantirEspaco(doc, y0, hBox + 8, margin, doc.internal.pageSize.getHeight());

  doc.setFillColor(C_CAIXA_FOOT.r, C_CAIXA_FOOT.g, C_CAIXA_FOOT.b);
  doc.setDrawColor(C_BORDA.r, C_BORDA.g, C_BORDA.b);
  doc.rect(margin, y, maxW, hBox, "F");
  doc.setFillColor(C_CAIXA_BORDA.r, C_CAIXA_BORDA.g, C_CAIXA_BORDA.b);
  doc.rect(margin, y, 3.5, hBox, "F");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(C_TEXTO.r, C_TEXTO.g, C_TEXTO.b);
  let ty = y + 14;
  for (let i = 0; i < linhas.length; i++) {
    doc.text(linhas[i] as string, margin + 14, ty);
    ty += lineH;
  }
  return y + hBox + 8;
}

export async function gerarPdfTermoAssinatura(
  dados: DadosPacienteTermo,
  rodape: RodapeDataLocal,
  signatureCanvas: HTMLCanvasElement,
): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;

  const fsBody = 10;
  const lh = 13;
  const fsTitulo = 13;
  const fsSub = 10;

  let y = margin;

  const logoDataUrl = await carregarLogoTermoPublico();
  if (logoDataUrl) {
    const { w: lw, h: lhLogo } = await tamanhoLogoNoPdf(logoDataUrl);
    if (lw > 0 && lhLogo > 0) {
      const cx = (pageW - lw) / 2;
      try {
        doc.addImage(logoDataUrl, "PNG", cx, y, lw, lhLogo);
      } catch {
        /* ignora logo inválida */
      }
      y += lhLogo + 14;
    }
  } else {
    y += 4;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(fsTitulo);
  doc.setTextColor(C_TITULO.r, C_TITULO.g, C_TITULO.b);
  const linhasTit = doc.splitTextToSize(TITULO_TERMO_PRINCIPAL, maxW);
  for (const ln of linhasTit) {
    doc.text(ln, pageW / 2, y, { align: "center" });
    y += 16;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(fsSub);
  doc.setTextColor(C_SUB.r, C_SUB.g, C_SUB.b);
  doc.text(SUBTITULO_TERMO, pageW / 2, y, { align: "center" });
  y += 18;

  doc.setDrawColor(C_BORDA.r, C_BORDA.g, C_BORDA.b);
  doc.setLineWidth(1);
  doc.line(margin, y, margin + maxW, y);
  y += 22;

  y = desenharTabelaPaciente(doc, dados, margin, y, maxW, fsBody, lh);

  y += 6;
  y = renderizarSegmentosComQuebra(
    doc,
    segmentosIntroTermoModelo(),
    margin,
    y,
    maxW,
    fsBody,
    lh,
    C_TEXTO,
  );
  y += 10;

  for (const cl of CLAUSULAS_TERMO_MODELO) {
    y = garantirEspaco(doc, y, 48, margin, pageH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(C_CLAUSULA_TIT.r, C_CLAUSULA_TIT.g, C_CLAUSULA_TIT.b);
    doc.text(cl.titulo, margin, y);
    y += 15;
    const partes = cl.corpo.split(/\n+/).filter((p) => p.trim());
    for (const parte of partes) {
      y = desenharTextoJustificado(doc, parte.trim(), margin, y, maxW, fsBody, lh, C_TEXTO);
    }
    y += 12;
  }

  y = desenharCaixaDeclaracao(doc, TEXTO_DECLARACAO_ASSINATURA_PLATAFORMA, margin, y, maxW, fsBody, lh);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(fsBody);
  doc.setTextColor(C_TEXTO.r, C_TEXTO.g, C_TEXTO.b);
  const linhaData = formatarLinhaDataLocalTermo(rodape);
  y = garantirEspaco(doc, y, lh + 8, margin, pageH);
  doc.text(linhaData, margin + maxW, y, { align: "right" });
  y += 28;

  const imgData = exportarAssinaturaTermoJpeg(signatureCanvas);
  const { cssW: assW, cssH: assH } = dimensoesCanvasAssinaturaTermo();
  const sigW = Math.min(320, maxW);
  const sigH = Math.min(140, sigW * (assH / Math.max(assW, 1)));

  y = garantirEspaco(doc, y, 28 + sigH + 100, margin, pageH);
  y += 8;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + maxW, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(C_MUDO.r, C_MUDO.g, C_MUDO.b);
  if (y + sigH + 24 > pageH - margin) {
    doc.addPage();
    y = margin + 18;
  }
  doc.text("Assinatura do paciente:", margin, y);
  y += 14;
  if (y + sigH > pageH - margin) {
    doc.addPage();
    y = margin + 22;
  }
  doc.setDrawColor(178, 178, 178);
  doc.roundedRect(margin, y, sigW, sigH, 2, 2);
  doc.addImage(imgData, "JPEG", margin + 4, y + 4, sigW - 8, sigH - 8);
  y += sigH + ESPACO_APOS_ASSINATURA_PACIENTE_PT;

  const alturaBlocoDigital =
    TITULO_ASSINATURA_DIGITAL_PT + ALTURA_CAIXA_ASSINATURA_DIGITAL_PT + 18;
  y = garantirEspaco(doc, y, alturaBlocoDigital + 40, margin, pageH);

  const pageIndexAssinatura = doc.getCurrentPageInfo().pageNumber - 1;
  const yTopCaixaDigital = y + TITULO_ASSINATURA_DIGITAL_PT;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(C_MUDO.r, C_MUDO.g, C_MUDO.b);
  doc.text("Assinatura digital da clínica", margin, y);
  y += TITULO_ASSINATURA_DIGITAL_PT;

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.5);
  doc.roundedRect(
    margin,
    y,
    LARGURA_CAIXA_ASSINATURA_DIGITAL_PT,
    ALTURA_CAIXA_ASSINATURA_DIGITAL_PT,
    2,
    2,
  );
  y += ALTURA_CAIXA_ASSINATURA_DIGITAL_PT + 18;

  const metaPosicao = serializarMetadadosPosicaoAssinaturaDigital({
    pageIndex: pageIndexAssinatura,
    yTopCaixaPt: yTopCaixaDigital,
  });
  doc.setProperties({
    subject: metaPosicao,
    keywords: metaPosicao,
  });

  const rodapeFont = 8;
  const rodapeLh = 11;
  y = garantirEspaco(doc, y, RODAPE_CLINICA_PDF_LINHAS.length * rodapeLh + 12, margin, pageH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(rodapeFont);
  doc.setTextColor(C_MUDO.r, C_MUDO.g, C_MUDO.b);
  doc.text(RODAPE_CLINICA_PDF_LINHAS[0], pageW / 2, y, { align: "center" });
  y += rodapeLh;
  doc.setFont("helvetica", "normal");
  for (let i = 1; i < RODAPE_CLINICA_PDF_LINHAS.length; i++) {
    const linha = RODAPE_CLINICA_PDF_LINHAS[i];
    const quebradas = doc.splitTextToSize(linha, maxW * 0.92);
    for (const q of quebradas) {
      doc.text(q, pageW / 2, y, { align: "center" });
      y += rodapeLh;
    }
  }

  return doc.output("blob");
}

/** Nome sugerido para download: `Termo_<paciente>_<AAAAMMDD>.pdf` */
export function montarNomeArquivoTermoAssinatura(nomePaciente: string, dataRef: Date = new Date()): string {
  const base = nomePaciente
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  const slug = base || "paciente";
  const dt = Number.isNaN(dataRef.getTime()) ? new Date() : dataRef;
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `Termo_${slug}_${y}${mo}${d}.pdf`;
}
