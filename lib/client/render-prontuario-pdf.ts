/** PDF do prontuário: procedimentos, evolução, fotos em página inteira e termo opcional. */

import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";

export type ProcedimentoPdfProntuario = {
  nome: string;
  quantidade: number;
};

export type TermoPdfProntuario = {
  tipo: "pdf" | "imagem";
  url: string;
  rotulo: string;
};

export type DadosPdfProntuario = {
  pacienteNome: string;
  dataInicio: string;
  dataFim?: string | null;
  sala?: string | null;
  status?: string | null;
  responsavel?: string | null;
  procedimentos: ProcedimentoPdfProntuario[];
  evolucao: string;
  fotos: { src: string }[];
  termo?: TermoPdfProntuario | null;
  incluirTermo: boolean;
};

const ROXO = { r: 79, g: 25, b: 100 };
const CORAL = { r: 222, g: 118, b: 91 };
const TEXTO = { r: 43, g: 36, b: 48 };
const MUDO = { r: 125, g: 106, b: 134 };

const MARGEM = 12;
const LADO_MAX_PX = 1800;

const dataHoraFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

type ImagemPronta = {
  dataUrl: string;
  w: number;
  h: number;
};

function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return dataHoraFmt.format(d);
}

function nomeArquivo(paciente: string, quando: Date): string {
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(quando);
  const slug = paciente
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `prontuario-${slug || "paciente"}-${dia}.pdf`;
}

function quebrar(doc: jsPDF, texto: string, largura: number): string[] {
  const linhas = doc.splitTextToSize(texto, Math.max(8, largura));
  return Array.isArray(linhas) ? linhas : [String(linhas)];
}

async function prepararImagem(src: string): Promise<ImagemPronta> {
  const res = await fetch(src);
  if (!res.ok) throw new Error("Não foi possível carregar uma das imagens.");
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
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.9), w, h };
}

function desenharPaginaFotos(
  doc: jsPDF,
  imagens: ImagemPronta[],
  indiceInicial: number,
  total: number,
) {
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(ROXO.r, ROXO.g, ROXO.b);
  const fim = indiceInicial + imagens.length;
  doc.text(
    total === 1 ? "Foto do atendimento" : `Fotos ${indiceInicial + 1} a ${fim} de ${total}`,
    MARGEM,
    MARGEM + 4,
  );

  const topo = MARGEM + 8;
  const base = altura - 16;
  const vao = 4;
  const colunas = 2;
  const linhas = 2;
  const caixaL = (largura - MARGEM * 2 - vao) / colunas;
  const caixaA = (base - topo - vao) / linhas;

  imagens.forEach((imagem, i) => {
    const coluna = i % colunas;
    const linha = Math.floor(i / colunas);
    const x0 = MARGEM + coluna * (caixaL + vao);
    const y0 = topo + linha * (caixaA + vao);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(ROXO.r, ROXO.g, ROXO.b);
    doc.text(`Foto ${indiceInicial + i + 1}`, x0, y0 + 3.5);

    const imgTopo = y0 + 5.5;
    const areaL = caixaL;
    const areaA = caixaA - 6.5;
    const proporcao = imagem.w / imagem.h;
    let desenhoL = areaL;
    let desenhoA = desenhoL / proporcao;
    if (desenhoA > areaA) {
      desenhoA = areaA;
      desenhoL = desenhoA * proporcao;
    }
    const x = x0 + (areaL - desenhoL) / 2;
    const y = imgTopo + (areaA - desenhoA) / 2;
    doc.addImage(imagem.dataUrl, "JPEG", x, y, desenhoL, desenhoA);
  });
}

function desenharImagemGrande(
  doc: jsPDF,
  imagem: ImagemPronta,
  titulo: string,
) {
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
  const x = MARGEM + (caixaL - desenhoL) / 2;
  const y = topo + (caixaA - desenhoA) / 2;
  doc.addImage(imagem.dataUrl, "JPEG", x, y, desenhoL, desenhoA);
}

function documentoPdfProntuario(dados: DadosPdfProntuario, imagens: ImagemPronta[]): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const util = largura - MARGEM * 2;
  let y = MARGEM;

  const garantir = (preciso: number) => {
    if (y + preciso <= altura - 18) return;
    doc.addPage();
    y = MARGEM;
  };

  const paragrafo = (texto: string, tamanho: number, negrito: boolean, cor: typeof TEXTO, depois: number) => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
    doc.setTextColor(cor.r, cor.g, cor.b);
    const linhas = quebrar(doc, texto, util);
    const passo = doc.getLineHeight() / doc.internal.scaleFactor;
    garantir(linhas.length * passo + depois);
    doc.text(linhas, MARGEM, y);
    y += linhas.length * passo + depois;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(ROXO.r, ROXO.g, ROXO.b);
  doc.text("Podoquiro", MARGEM, y + 5);
  y += 8;
  paragrafo("Prontuário do atendimento", 12, true, TEXTO, 2);
  doc.setDrawColor(CORAL.r, CORAL.g, CORAL.b);
  doc.setLineWidth(0.8);
  doc.line(MARGEM, y, largura - MARGEM, y);
  y += 6;

  const fim = dados.dataFim ? ` até ${formatarDataHora(dados.dataFim)}` : "";
  const linhasInfo = [
    `Paciente: ${dados.pacienteNome.trim() || "Paciente"}`,
    `Data: ${formatarDataHora(dados.dataInicio)}${fim}`,
  ];
  if (dados.sala?.trim()) linhasInfo.push(`Sala: ${dados.sala.trim()}`);
  if (dados.status?.trim()) linhasInfo.push(`Status: ${dados.status.trim()}`);
  if (dados.responsavel?.trim()) linhasInfo.push(`Responsável: ${dados.responsavel.trim()}`);
  for (const linha of linhasInfo) paragrafo(linha, 10, false, TEXTO, 1.2);

  y += 2;
  paragrafo("Procedimentos realizados", 12, true, ROXO, 2);
  if (dados.procedimentos.length === 0) {
    paragrafo("Nenhum procedimento registrado.", 10, false, MUDO, 2);
  } else {
    for (const proc of dados.procedimentos) {
      const qtd = proc.quantidade > 1 ? ` (${proc.quantidade}x)` : "";
      paragrafo(`- ${proc.nome.trim() || "Procedimento"}${qtd}`, 10, false, TEXTO, 1);
    }
  }

  y += 2;
  paragrafo("Evolução", 12, true, ROXO, 2);
  const evolucao = dados.evolucao.trim();
  paragrafo(evolucao || "Sem evolução registrada.", 10, false, evolucao ? TEXTO : MUDO, 3);

  if (imagens.length === 0) {
    paragrafo("Nenhuma foto anexada a este atendimento.", 10, false, MUDO, 2);
  } else {
    paragrafo(
      `${imagens.length} foto${imagens.length > 1 ? "s" : ""} a seguir, até 4 por página.`,
      10,
      false,
      TEXTO,
      2,
    );
  }

  if (dados.incluirTermo && dados.termo) {
    paragrafo("O termo assinado pelo paciente segue ao final deste documento.", 10, false, TEXTO, 2);
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
    doc.text("Podoquiro · Prontuário", MARGEM, yRodape);
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

export async function baixarPdfProntuario(dados: DadosPdfProntuario): Promise<void> {
  const imagens: ImagemPronta[] = [];
  for (const foto of dados.fotos) {
    if (!foto.src) continue;
    imagens.push(await prepararImagem(foto.src));
  }

  let termoImagem: ImagemPronta | null = null;
  let termoPdf: ArrayBuffer | null = null;
  if (dados.incluirTermo && dados.termo) {
    if (dados.termo.tipo === "pdf") {
      const res = await fetch(dados.termo.url);
      if (!res.ok) throw new Error("Não foi possível carregar o termo assinado.");
      termoPdf = await res.arrayBuffer();
    } else {
      termoImagem = await prepararImagem(dados.termo.url);
    }
  }

  const doc = documentoPdfProntuario(dados, imagens);
  if (termoImagem && dados.termo) {
    desenharImagemGrande(doc, termoImagem, dados.termo.rotulo);
  }
  carimbarRodape(doc);

  let bytes = new Uint8Array(doc.output("arraybuffer"));
  if (termoPdf) {
    const principal = await PDFDocument.load(bytes);
    const anexo = await PDFDocument.load(termoPdf);
    const paginas = await principal.copyPages(anexo, anexo.getPageIndices());
    paginas.forEach((pagina) => principal.addPage(pagina));
    bytes = new Uint8Array(await principal.save());
  }

  baixarBytes(bytes, nomeArquivo(dados.pacienteNome, new Date()));
}
