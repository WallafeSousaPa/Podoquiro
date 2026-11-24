/** PDF da avaliação do paciente: ficha, fotos (até 4 por folha) e termo opcional. */

import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";

export type CampoAvaliacaoPdf = { rotulo: string; valor: string };
export type FotoAvaliacaoPdf = { rotulo: string; src: string };
export type TermoAvaliacaoPdf = { tipo: "pdf" | "imagem"; url: string; rotulo: string };

export type DadosPdfAvaliacao = {
  pacienteNome: string;
  campos: CampoAvaliacaoPdf[];
  fotos: FotoAvaliacaoPdf[];
  termo?: TermoAvaliacaoPdf | null;
  incluirTermo: boolean;
};

const ROXO = { r: 79, g: 25, b: 100 };
const CORAL = { r: 222, g: 118, b: 91 };
const TEXTO = { r: 43, g: 36, b: 48 };
const MUDO = { r: 125, g: 106, b: 134 };
const MARGEM = 12;
const LADO_MAX_PX = 1400;

type ImagemPronta = { dataUrl: string; w: number; h: number; rotulo: string };

function quebrar(doc: jsPDF, texto: string, largura: number): string[] {
  const linhas = doc.splitTextToSize(texto, Math.max(8, largura));
  return Array.isArray(linhas) ? linhas : [String(linhas)];
}

function nomeArquivo(paciente: string): string {
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const slug = paciente
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `avaliacao-${slug || "paciente"}-${dia}.pdf`;
}

async function prepararImagem(src: string, rotulo: string): Promise<ImagemPronta> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Não foi possível carregar a imagem "${rotulo}".`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const escala = Math.min(1, LADO_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Não foi possível preparar a imagem para o PDF.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.88), w, h, rotulo };
}

function desenharPaginaFotos(doc: jsPDF, imagens: ImagemPronta[], indiceInicial: number, total: number) {
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(ROXO.r, ROXO.g, ROXO.b);
  const fim = indiceInicial + imagens.length;
  doc.text(total <= 4 ? "Fotos da avaliação" : `Fotos ${indiceInicial + 1} a ${fim} de ${total}`, MARGEM, MARGEM + 4);

  const topo = MARGEM + 8;
  const base = altura - 16;
  const vao = 4;
  const caixaL = (largura - MARGEM * 2 - vao) / 2;
  const caixaA = (base - topo - vao) / 2;

  imagens.forEach((imagem, i) => {
    const coluna = i % 2;
    const linha = Math.floor(i / 2);
    const x0 = MARGEM + coluna * (caixaL + vao);
    const y0 = topo + linha * (caixaA + vao);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(ROXO.r, ROXO.g, ROXO.b);
    doc.text(quebrar(doc, imagem.rotulo, caixaL - 1)[0] ?? imagem.rotulo, x0, y0 + 3.5);

    const imgTopo = y0 + 5.5;
    const areaA = caixaA - 6.5;
    const proporcao = imagem.w / imagem.h;
    let desenhoL = caixaL;
    let desenhoA = desenhoL / proporcao;
    if (desenhoA > areaA) {
      desenhoA = areaA;
      desenhoL = desenhoA * proporcao;
    }
    doc.addImage(
      imagem.dataUrl,
      "JPEG",
      x0 + (caixaL - desenhoL) / 2,
      imgTopo + (areaA - desenhoA) / 2,
      desenhoL,
      desenhoA,
    );
  });
}

function desenharImagemPagina(doc: jsPDF, imagem: ImagemPronta, titulo: string) {
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(ROXO.r, ROXO.g, ROXO.b);
  doc.text(titulo, MARGEM, MARGEM + 4);
  const topo = MARGEM + 8;
  const caixaL = largura - MARGEM * 2;
  const caixaA = altura - topo - 16;
  const proporcao = imagem.w / imagem.h;
  let desenhoL = caixaL;
  let desenhoA = desenhoL / proporcao;
  if (desenhoA > caixaA) {
    desenhoA = caixaA;
    desenhoL = desenhoA * proporcao;
  }
  doc.addImage(
    imagem.dataUrl,
    "JPEG",
    MARGEM + (caixaL - desenhoL) / 2,
    topo + (caixaA - desenhoA) / 2,
    desenhoL,
    desenhoA,
  );
}

function documentoPdfAvaliacao(dados: DadosPdfAvaliacao, imagens: ImagemPronta[]): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const util = largura - MARGEM * 2;
  const colW = util / 2 - 3;
  let y = MARGEM;

  const garantir = (preciso: number) => {
    if (y + preciso <= altura - 18) return;
    doc.addPage();
    y = MARGEM;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(ROXO.r, ROXO.g, ROXO.b);
  doc.text("Podoquiro", MARGEM, y + 5);
  y += 11;
  doc.setFontSize(12);
  doc.setTextColor(TEXTO.r, TEXTO.g, TEXTO.b);
  doc.text("Avaliação do paciente", MARGEM, y);
  y += 3;
  doc.setDrawColor(CORAL.r, CORAL.g, CORAL.b);
  doc.setLineWidth(0.8);
  doc.line(MARGEM, y, largura - MARGEM, y);
  y += 6;

  const campos = dados.campos.filter((c) => c.valor.trim() && c.valor.trim() !== "-");
  for (let i = 0; i < campos.length; i += 2) {
    const par = [campos[i], campos[i + 1]].filter((c): c is CampoAvaliacaoPdf => Boolean(c));
    const blocos = par.map((campo) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      const rotulo = quebrar(doc, campo.rotulo, colW);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const valor = quebrar(doc, campo.valor, colW);
      const passoRotulo = 3.6;
      const passoValor = doc.getLineHeight() / doc.internal.scaleFactor;
      return { rotulo, valor, altura: rotulo.length * passoRotulo + valor.length * passoValor + 2.2 };
    });
    const alturaBloco = Math.max(...blocos.map((b) => b.altura));
    garantir(alturaBloco);
    blocos.forEach((bloco, indice) => {
      const x = MARGEM + indice * (colW + 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(MUDO.r, MUDO.g, MUDO.b);
      doc.text(bloco.rotulo, x, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(TEXTO.r, TEXTO.g, TEXTO.b);
      doc.text(bloco.valor, x, y + bloco.rotulo.length * 3.6);
    });
    y += alturaBloco;
  }

  y += 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(TEXTO.r, TEXTO.g, TEXTO.b);
  const aviso =
    imagens.length === 0
      ? "Nenhuma foto anexada a esta avaliação."
      : `${imagens.length} foto${imagens.length > 1 ? "s" : ""} a seguir, até 4 por página.`;
  const linhasAviso = quebrar(doc, aviso, util);
  const passo = doc.getLineHeight() / doc.internal.scaleFactor;
  garantir(linhasAviso.length * passo + 2);
  doc.text(linhasAviso, MARGEM, y);
  y += linhasAviso.length * passo + 2;

  if (dados.incluirTermo && dados.termo) {
    const extra = quebrar(doc, "O termo assinado pelo paciente segue ao final deste documento.", util);
    garantir(extra.length * passo + 2);
    doc.text(extra, MARGEM, y);
  }

  for (let i = 0; i < imagens.length; i += 4) {
    desenharPaginaFotos(doc, imagens.slice(i, i + 4), i, imagens.length);
  }
  return doc;
}

function carimbarRodape(doc: jsPDF) {
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina);
    const yRodape = altura - 8;
    doc.setDrawColor(ROXO.r, ROXO.g, ROXO.b);
    doc.setLineWidth(0.3);
    doc.line(MARGEM, yRodape - 3, largura - MARGEM, yRodape - 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUDO.r, MUDO.g, MUDO.b);
    doc.text("Podoquiro · Avaliação", MARGEM, yRodape);
    doc.text(`Página ${pagina} de ${total}`, largura - MARGEM, yRodape, { align: "right" });
  }
}

function baixarBytes(bytes: Uint8Array, nome: string) {
  const copia = new Uint8Array(bytes.byteLength);
  copia.set(bytes);
  const blob = new Blob([copia], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

export async function baixarPdfAvaliacao(dados: DadosPdfAvaliacao): Promise<void> {
  const imagens: ImagemPronta[] = [];
  for (const foto of dados.fotos) {
    if (!foto.src) continue;
    imagens.push(await prepararImagem(foto.src, foto.rotulo));
  }

  let termoImagem: ImagemPronta | null = null;
  let termoPdf: ArrayBuffer | null = null;
  if (dados.incluirTermo && dados.termo) {
    if (dados.termo.tipo === "pdf") {
      const res = await fetch(dados.termo.url);
      if (!res.ok) throw new Error("Não foi possível carregar o termo assinado.");
      termoPdf = await res.arrayBuffer();
    } else {
      termoImagem = await prepararImagem(dados.termo.url, dados.termo.rotulo);
    }
  }

  const doc = documentoPdfAvaliacao(dados, imagens);
  if (termoImagem && dados.termo) desenharImagemPagina(doc, termoImagem, dados.termo.rotulo);
  carimbarRodape(doc);

  let bytes = new Uint8Array(doc.output("arraybuffer"));
  if (termoPdf) {
    const principal = await PDFDocument.load(bytes);
    const anexo = await PDFDocument.load(termoPdf);
    const paginas = await principal.copyPages(anexo, anexo.getPageIndices());
    paginas.forEach((pagina) => principal.addPage(pagina));
    bytes = new Uint8Array(await principal.save());
  }
  baixarBytes(bytes, nomeArquivo(dados.pacienteNome));
}
