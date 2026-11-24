/** PDF da tabela de procedimentos cadastrados — gerado no browser. */

import { jsPDF } from "jspdf";

export type ProcedimentoPdf = {
  id: number;
  procedimento: string;
  custo_base: number;
  margem_lucro: number;
  taxas_impostos: number;
  valor_total: number;
  ativo: boolean;
  ultima_atualizacao: string;
};

const ROXO = { r: 79, g: 25, b: 100 };
const CORAL = { r: 222, g: 118, b: 91 };
const TEXTO = { r: 43, g: 36, b: 48 };
const MUDO = { r: 125, g: 106, b: 134 };
const ZEBRA = { r: 251, g: 247, b: 252 };
const BORDA = { r: 234, g: 223, b: 240 };

const MARGEM = 10;
const ALTURA_RODAPE = 14;
const LOGO_MAX_L = 18;
const LOGO_MAX_A = 14;

type Coluna = {
  titulo: string;
  w: number;
  align: "left" | "right";
  valor: (linha: ProcedimentoPdf) => string;
};

const moneyFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const pctFmt = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const dataHoraFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return dataHoraFmt.format(d);
}

function nomeArquivo(quando: Date): string {
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(quando);
  return `procedimentos-${dia}.pdf`;
}

function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

async function carregarLogo(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(`${window.location.origin}/IconePodoquiro.png`, {
      cache: "force-cache",
    });
    if (!res.ok) return null;
    return blobParaDataUrl(await res.blob());
  } catch {
    return null;
  }
}

function tamanhoLogo(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      if (!nw || !nh) {
        resolve({ w: LOGO_MAX_L, h: LOGO_MAX_A });
        return;
      }
      const s = Math.min(LOGO_MAX_L / nw, LOGO_MAX_A / nh, 1);
      resolve({ w: nw * s, h: nh * s });
    };
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = dataUrl;
  });
}

function colunas(larguraUtil: number): Coluna[] {
  const fixas: Coluna[] = [
    { titulo: "ID", w: 14, align: "left", valor: (l) => String(l.id) },
    {
      titulo: "Procedimento",
      w: 0,
      align: "left",
      valor: (l) => l.procedimento.trim() || "-",
    },
    {
      titulo: "Custo base",
      w: 28,
      align: "right",
      valor: (l) => moneyFmt.format(l.custo_base),
    },
    {
      titulo: "Margem",
      w: 22,
      align: "right",
      valor: (l) => `${pctFmt.format(l.margem_lucro)}%`,
    },
    {
      titulo: "Taxas",
      w: 22,
      align: "right",
      valor: (l) => `${pctFmt.format(l.taxas_impostos)}%`,
    },
    {
      titulo: "Valor total",
      w: 30,
      align: "right",
      valor: (l) => moneyFmt.format(l.valor_total),
    },
    {
      titulo: "Status",
      w: 20,
      align: "left",
      valor: (l) => (l.ativo ? "Ativo" : "Inativo"),
    },
    {
      titulo: "Atualização",
      w: 38,
      align: "left",
      valor: (l) => formatarDataHora(l.ultima_atualizacao),
    },
  ];
  const somaFixa = fixas.reduce((s, c) => s + c.w, 0);
  const nome = fixas[1];
  if (nome) nome.w = Math.max(40, larguraUtil - somaFixa);
  return fixas;
}

function quebrar(doc: jsPDF, texto: string, largura: number): string[] {
  const linhas = doc.splitTextToSize(texto, Math.max(4, largura));
  return Array.isArray(linhas) ? linhas : [String(linhas)];
}

function desenharRodape(doc: jsPDF, pagina: number, total: number) {
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const y = altura - 6;
  doc.setDrawColor(ROXO.r, ROXO.g, ROXO.b);
  doc.setLineWidth(0.3);
  doc.line(MARGEM, y - 3.2, largura - MARGEM, y - 3.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUDO.r, MUDO.g, MUDO.b);
  doc.text("Podoquiro · Documento interno", MARGEM, y);
  doc.text(`Página ${pagina} de ${total}`, largura - MARGEM, y, { align: "right" });
}

export function documentoPdfProcedimentos(
  linhas: ProcedimentoPdf[],
  opcoes?: { logoDataUrl?: string | null; logoMm?: { w: number; h: number }; geradoEm?: Date },
): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const geradoEm = opcoes?.geradoEm ?? new Date();
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const larguraUtil = largura - MARGEM * 2;
  const cols = colunas(larguraUtil);
  const limiteY = altura - ALTURA_RODAPE;
  const ativos = linhas.filter((l) => l.ativo).length;

  const desenharCabecalho = () => {
    let y = MARGEM;
    let textoX = MARGEM;
    const logo = opcoes?.logoDataUrl;
    const logoMm = opcoes?.logoMm;
    if (logo && logoMm && logoMm.w > 0 && logoMm.h > 0) {
      doc.addImage(logo, "PNG", MARGEM, y, logoMm.w, logoMm.h);
      textoX = MARGEM + logoMm.w + 4;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(ROXO.r, ROXO.g, ROXO.b);
    doc.text("Podoquiro", textoX, y + 6);
    doc.setFontSize(11);
    doc.setTextColor(TEXTO.r, TEXTO.g, TEXTO.b);
    doc.text("Procedimentos cadastrados", textoX, y + 11.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUDO.r, MUDO.g, MUDO.b);
    doc.text(
      `Gerado em ${dataHoraFmt.format(geradoEm)}  |  ${linhas.length} procedimento(s), ${ativos} ativo(s)`,
      textoX,
      y + 16,
    );
    const linhaY = y + 19;
    doc.setDrawColor(CORAL.r, CORAL.g, CORAL.b);
    doc.setLineWidth(0.8);
    doc.line(MARGEM, linhaY, largura - MARGEM, linhaY);
    return linhaY + 4;
  };

  const desenharTitulos = (y: number) => {
    const h = 7;
    doc.setFillColor(ROXO.r, ROXO.g, ROXO.b);
    doc.rect(MARGEM, y, larguraUtil, h, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    let x = MARGEM;
    for (const col of cols) {
      const pad = 1.6;
      doc.text(col.titulo, col.align === "right" ? x + col.w - pad : x + pad, y + 4.6, {
        align: col.align,
      });
      x += col.w;
    }
    return y + h;
  };

  let y = desenharTitulos(desenharCabecalho());

  if (linhas.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(MUDO.r, MUDO.g, MUDO.b);
    doc.text("Nenhum procedimento cadastrado.", MARGEM, y + 8);
  }

  linhas.forEach((linha, indice) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const textos = cols.map((col) => quebrar(doc, col.valor(linha), col.w - 3.2));
    const maior = textos.reduce((m, t) => Math.max(m, t.length), 1);
    const h = Math.max(7, maior * 3.6 + 2.2);
    if (y + h > limiteY) {
      doc.addPage();
      y = desenharTitulos(desenharCabecalho());
    }
    if (indice % 2 === 1) {
      doc.setFillColor(ZEBRA.r, ZEBRA.g, ZEBRA.b);
      doc.rect(MARGEM, y, larguraUtil, h, "F");
    }
    doc.setDrawColor(BORDA.r, BORDA.g, BORDA.b);
    doc.setLineWidth(0.15);
    doc.line(MARGEM, y + h, MARGEM + larguraUtil, y + h);

    let x = MARGEM;
    cols.forEach((col, i) => {
      const pad = 1.6;
      const bloco = textos[i] ?? [""];
      if (col.titulo === "Status") {
        if (linha.ativo) doc.setTextColor(25, 135, 84);
        else doc.setTextColor(MUDO.r, MUDO.g, MUDO.b);
        doc.setFont("helvetica", "bold");
      } else if (col.titulo === "Valor total") {
        doc.setTextColor(ROXO.r, ROXO.g, ROXO.b);
        doc.setFont("helvetica", "bold");
      } else {
        doc.setTextColor(TEXTO.r, TEXTO.g, TEXTO.b);
        doc.setFont("helvetica", "normal");
      }
      doc.text(bloco, col.align === "right" ? x + col.w - pad : x + pad, y + 4.6, {
        align: col.align,
      });
      x += col.w;
    });
    y += h;
  });

  const total = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina);
    desenharRodape(doc, pagina, total);
  }
  return doc;
}

export async function baixarPdfProcedimentos(linhas: ProcedimentoPdf[]): Promise<void> {
  const logoDataUrl = await carregarLogo();
  const logoMm = logoDataUrl ? await tamanhoLogo(logoDataUrl) : undefined;
  const geradoEm = new Date();
  const doc = documentoPdfProcedimentos(linhas, { logoDataUrl, logoMm, geradoEm });
  doc.save(nomeArquivo(geradoEm));
}
