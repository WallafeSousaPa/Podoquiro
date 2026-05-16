/**
 * Desenha o retângulo visual de assinatura digital (estilo ICP-Brasil / validador)
 * logo abaixo da assinatura do paciente, antes do placeholder e da assinatura @signpdf.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  ALTURA_CAIXA_ASSINATURA_DIGITAL_PT,
  LARGURA_CAIXA_ASSINATURA_DIGITAL_PT,
  MARGEM_ASSINATURA_DIGITAL_PT,
  parsearMetadadosPosicaoAssinaturaDigital,
  retanguloPdfDeYSuperior,
} from "@/lib/termo-consentimento/layout-assinatura-digital-termo";

export type RetanguloAssinaturaDigitalOpts = {
  nomeEmpresa: string;
  nomeTitularCertificado: string;
  dataAssinatura: Date;
};

const FONTE_PT = 8;
const ENTRE_LINHAS_PT = 11;
const PADDING_INTERNO_PT = 7;

function formatarDataHoraAssinaturaBr(d: Date): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${fmt.format(d).replace(",", "")} BRT`;
}

function truncarTexto(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Preenche a caixa reservada no PDF do termo; retorna `widgetRect` [x1,y1,x2,y2]
 * em coordenadas PDF (origem canto inferior esquerdo) para o @signpdf.
 */
export async function adicionarRetanguloAssinaturaDigitalPdf(
  pdfEntrada: Buffer,
  opts: RetanguloAssinaturaDigitalOpts,
): Promise<{
  pdfBuffer: Buffer;
  widgetRect: [number, number, number, number];
  pageIndex: number;
}> {
  const pdfDoc = await PDFDocument.load(pdfEntrada);
  const pages = pdfDoc.getPages();
  if (!pages.length) {
    throw new Error("PDF do termo sem páginas.");
  }

  const meta = parsearMetadadosPosicaoAssinaturaDigital(
    pdfDoc.getSubject() || pdfDoc.getKeywords(),
  );
  const pageIndex =
    meta && meta.pageIndex >= 0 && meta.pageIndex < pages.length
      ? meta.pageIndex
      : pages.length - 1;
  const page = pages[pageIndex]!;
  const { width: pageW, height: pageH } = page.getSize();

  const yTopCaixaPt =
    meta?.yTopCaixaPt ??
    pageH * 0.22 - ALTURA_CAIXA_ASSINATURA_DIGITAL_PT;

  const [x1, y1, x2, y2] = retanguloPdfDeYSuperior(pageH, yTopCaixaPt);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const titular = truncarTexto(opts.nomeTitularCertificado, 52);
  const empresa = truncarTexto(opts.nomeEmpresa, 45);
  const dataHora = formatarDataHoraAssinaturaBr(opts.dataAssinatura);

  page.drawRectangle({
    x: x1,
    y: y1,
    width: LARGURA_CAIXA_ASSINATURA_DIGITAL_PT,
    height: ALTURA_CAIXA_ASSINATURA_DIGITAL_PT,
    borderColor: rgb(0.35, 0.35, 0.35),
    borderWidth: 0.8,
    color: rgb(1, 1, 1),
  });

  const linhas: { texto: string; negrito: boolean }[] = [
    { texto: "Assinado de forma digital por", negrito: false },
    { texto: titular, negrito: true },
    { texto: empresa, negrito: false },
    { texto: dataHora, negrito: false },
  ];

  let cursorY = y2 - PADDING_INTERNO_PT - FONTE_PT;
  for (const linha of linhas) {
    try {
      page.drawText(linha.texto, {
        x: x1 + PADDING_INTERNO_PT,
        y: cursorY,
        size: FONTE_PT,
        font: linha.negrito ? fontBold : font,
        color: rgb(0.12, 0.12, 0.12),
      });
    } catch {
      // WinAnsi não suporta alguns caracteres do CN — fallback ASCII.
      const ascii = linha.texto.replace(/[^\x20-\x7E]/g, "?");
      page.drawText(ascii, {
        x: x1 + PADDING_INTERNO_PT,
        y: cursorY,
        size: FONTE_PT,
        font: linha.negrito ? fontBold : font,
        color: rgb(0.12, 0.12, 0.12),
      });
    }
    cursorY -= ENTRE_LINHAS_PT;
  }

  void pageW;

  const pdfBuffer = Buffer.from(
    await pdfDoc.save({
      useObjectStreams: false,
    }),
  );
  const widgetRect: [number, number, number, number] = [x1, y1, x2, y2];

  return { pdfBuffer, widgetRect, pageIndex };
}
