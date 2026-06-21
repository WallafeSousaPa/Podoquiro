/** Gera o DANFE-NFC-e (modelo 65) em PDF de 80mm para impressão — apenas no browser. */

import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { DanfeNfceDados } from "@/lib/sefaz/nfe";

export type DanfeNfceCompleto = DanfeNfceDados & {
  ambiente: number;
  chave: string | null;
  protocolo: string | null;
};

const LARGURA_MM = 80;
const MARGEM = 4;
const USAVEL = LARGURA_MM - MARGEM * 2;
const CENTRO = LARGURA_MM / 2;
const QR_MM = 38;
const LOGO_MAX_LARGURA_MM = 52;
const LOGO_MAX_ALTURA_MM = 18;
const LOGO_PUBLICO = "/PodoquiroLogoHome.jpeg";

const TPAG_LABEL: Record<string, string> = {
  "01": "Dinheiro",
  "02": "Cheque",
  "03": "Cartão de Crédito",
  "04": "Cartão de Débito",
  "05": "Crédito Loja",
  "10": "Vale Alimentação",
  "11": "Vale Refeição",
  "12": "Vale Presente",
  "13": "Vale Combustível",
  "15": "Boleto Bancário",
  "16": "Depósito Bancário",
  "17": "PIX",
  "18": "Transferência",
  "19": "Programa de Fidelidade",
  "90": "Sem Pagamento",
  "99": "Outros",
};

function brl(valor: string | number): string {
  const n = typeof valor === "number" ? valor : Number(valor || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDataHora(iso: string): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

function chaveEmBlocos(chave: string | null): string {
  const c = (chave ?? "").replace(/\D/g, "");
  return c.replace(/(.{4})/g, "$1 ").trim();
}

function fmtCep(cep: string): string {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return cep.trim() || "—";
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function fmtFone(fone: string): string {
  const d = fone.replace(/\D/g, "");
  if (d.length === 10) {
    return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  if (d.length === 11) {
    return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  return fone.trim();
}

/** Monta linhas de endereço do emitente para o cabeçalho do DANFE. */
function linhasEnderecoEmit(d: DanfeNfceCompleto): string[] {
  const e = d.emit;
  const linhas: string[] = [];

  const logradouro = [e.xLgr, e.nro].filter(Boolean).join(", ");
  const compl = e.xCpl?.trim();
  if (logradouro) {
    linhas.push(compl ? `${logradouro} - ${compl}` : logradouro);
  } else if (compl) {
    linhas.push(compl);
  }

  const local = [e.xBairro, e.xMun, e.uf].filter(Boolean).join(" - ");
  if (local) linhas.push(local);

  const cepFmt = fmtCep(e.cep);
  if (cepFmt !== "—") linhas.push(`CEP: ${cepFmt}`);

  const foneFmt = fmtFone(e.fone);
  if (foneFmt) linhas.push(`Tel.: ${foneFmt}`);

  return linhas;
}

function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function carregarLogoDanfe(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const url = `${window.location.origin}${LOGO_PUBLICO}`;
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    return blobParaDataUrl(await res.blob());
  } catch {
    return null;
  }
}

function tamanhoLogoDanfeMm(dataUrl: string): Promise<{ w: number; h: number; formato: "JPEG" | "PNG" }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      if (!nw || !nh) {
        resolve({ w: 0, h: 0, formato: "JPEG" });
        return;
      }
      const aspect = nw / nh;
      let w = LOGO_MAX_LARGURA_MM;
      let h = w / aspect;
      if (h > LOGO_MAX_ALTURA_MM) {
        h = LOGO_MAX_ALTURA_MM;
        w = h * aspect;
      }
      const formato = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      resolve({ w, h, formato });
    };
    img.onerror = () => resolve({ w: 0, h: 0, formato: "JPEG" });
    img.src = dataUrl;
  });
}

function fmtDoc(doc: string, tipo: "CPF" | "CNPJ" | null): string {
  const d = doc.replace(/\D/g, "");
  if (tipo === "CNPJ" && d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  if (tipo === "CPF" && d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return doc;
}

type LogoDanfe = { dataUrl: string; w: number; h: number; formato: "JPEG" | "PNG" } | null;

type Ctx = {
  doc: jsPDF;
  y: number;
  measure: boolean;
  qrImg: string | null;
  logo: LogoDanfe;
  ambienteHomolog: boolean;
};

function escrever(ctx: Ctx, texto: string, opts: { size?: number; bold?: boolean; align?: "left" | "center" | "right"; gap?: number } = {}): void {
  const { size = 7, bold = false, align = "left", gap = 0.6 } = opts;
  ctx.doc.setFont("helvetica", bold ? "bold" : "normal");
  ctx.doc.setFontSize(size);
  const linhas = ctx.doc.splitTextToSize(texto, USAVEL) as string[];
  for (const linha of linhas) {
    const x = align === "center" ? CENTRO : align === "right" ? LARGURA_MM - MARGEM : MARGEM;
    if (!ctx.measure) ctx.doc.text(linha, x, ctx.y, { align });
    ctx.y += size * 0.42 + gap;
  }
}

function par(ctx: Ctx, esq: string, dir: string, opts: { size?: number; bold?: boolean } = {}): void {
  const { size = 7, bold = false } = opts;
  ctx.doc.setFont("helvetica", bold ? "bold" : "normal");
  ctx.doc.setFontSize(size);
  if (!ctx.measure) {
    ctx.doc.text(esq, MARGEM, ctx.y);
    ctx.doc.text(dir, LARGURA_MM - MARGEM, ctx.y, { align: "right" });
  }
  ctx.y += size * 0.42 + 0.8;
}

function separador(ctx: Ctx): void {
  ctx.y += 1;
  if (!ctx.measure) {
    ctx.doc.setLineWidth(0.1);
    ctx.doc.setDrawColor(120);
    ctx.doc.line(MARGEM, ctx.y, LARGURA_MM - MARGEM, ctx.y);
  }
  ctx.y += 2;
}

function desenhar(ctx: Ctx, d: DanfeNfceCompleto): number {
  ctx.y = MARGEM + 2;

  const homolog = ctx.ambienteHomolog;
  if (homolog) {
    escrever(ctx, "AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL", { size: 7.5, bold: true, align: "center" });
    separador(ctx);
  }

  if (ctx.logo && ctx.logo.w > 0 && ctx.logo.h > 0) {
    ctx.y += 1;
    if (!ctx.measure) {
      try {
        ctx.doc.addImage(
          ctx.logo.dataUrl,
          ctx.logo.formato,
          CENTRO - ctx.logo.w / 2,
          ctx.y,
          ctx.logo.w,
          ctx.logo.h,
        );
      } catch {
        /* ignora logo inválida */
      }
    }
    ctx.y += ctx.logo.h + 2;
  }

  const titulo = d.emit.xFant?.trim() || d.emit.xNome;
  escrever(ctx, titulo, { size: 9, bold: true, align: "center" });
  if (d.emit.xFant && d.emit.xNome && d.emit.xFant.trim() !== d.emit.xNome.trim()) {
    escrever(ctx, d.emit.xNome, { size: 6.5, align: "center" });
  }
  escrever(ctx, `CNPJ: ${fmtDoc(d.emit.cnpj, "CNPJ")}`, { size: 6.5, align: "center" });
  if (d.emit.ie?.trim()) {
    escrever(ctx, `Inscrição Estadual: ${d.emit.ie}`, { size: 6.5, align: "center" });
  }
  for (const linha of linhasEnderecoEmit(d)) {
    escrever(ctx, linha, { size: 6.5, align: "center", gap: 0.4 });
  }

  separador(ctx);
  escrever(ctx, "DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica", { size: 6.5, bold: true, align: "center" });
  separador(ctx);

  // Itens
  par(ctx, "Descrição", "Vlr Total", { size: 6.5, bold: true });
  let totalItens = 0;
  for (const it of d.itens) {
    totalItens += Number(it.qCom || 0);
    escrever(ctx, `${it.cProd} ${it.xProd}`, { size: 6.5, gap: 0.3 });
    const q = Number(it.qCom || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
    const vu = brl(it.vUnCom);
    par(ctx, `   ${q} ${it.uCom} x ${vu}`, brl(it.vProd), { size: 6.5 });
  }

  separador(ctx);
  par(ctx, `Qtde. total de itens`, String(d.itens.length), { size: 7 });
  par(ctx, "Valor total dos produtos", brl(d.vProd), { size: 7 });
  if (Number(d.vDesc || 0) > 0) par(ctx, "Descontos", brl(d.vDesc), { size: 7 });
  par(ctx, "VALOR A PAGAR", brl(d.vNF), { size: 8.5, bold: true });

  if (d.pagamentos.length > 0) {
    ctx.y += 0.5;
    par(ctx, "Forma de pagamento", "Valor", { size: 6.5, bold: true });
    for (const p of d.pagamentos) {
      par(ctx, TPAG_LABEL[p.tPag] ?? `Pagamento (${p.tPag})`, brl(p.vPag), { size: 7 });
    }
  }

  separador(ctx);
  if (d.dest && d.dest.doc) {
    escrever(ctx, `Consumidor: ${d.dest.tipoDoc ?? "DOC"} ${fmtDoc(d.dest.doc, d.dest.tipoDoc)}`, { size: 6.5 });
    if (d.dest.xNome) escrever(ctx, d.dest.xNome, { size: 6.5 });
  } else {
    escrever(ctx, "CONSUMIDOR NÃO IDENTIFICADO", { size: 6.5, bold: true });
  }

  separador(ctx);
  escrever(ctx, `Número: ${d.nNF}    Série: ${d.serie}`, { size: 6.5 });
  escrever(ctx, `Emissão: ${fmtDataHora(d.dhEmi)}`, { size: 6.5 });
  escrever(ctx, "Consulte pela Chave de Acesso em:", { size: 6.5, bold: true });
  escrever(ctx, d.urlChave, { size: 6, gap: 0.4 });
  escrever(ctx, chaveEmBlocos(d.chave), { size: 6.5, align: "center" });

  if (d.protocolo) {
    escrever(ctx, `Protocolo de autorização: ${d.protocolo}`, { size: 6, align: "center", gap: 0.4 });
  }

  // QR Code
  ctx.y += 1.5;
  if (!ctx.measure && ctx.qrImg) {
    ctx.doc.addImage(ctx.qrImg, "PNG", CENTRO - QR_MM / 2, ctx.y, QR_MM, QR_MM);
  }
  ctx.y += QR_MM + 2;

  if (homolog) {
    escrever(ctx, "EMITIDA EM HOMOLOGAÇÃO - SEM VALOR FISCAL", { size: 7, bold: true, align: "center" });
  }

  ctx.y += MARGEM;
  return ctx.y;
}

/** Gera o PDF do DANFE-NFC-e e retorna uma URL de objeto (blob) para abrir/baixar. */
export async function gerarDanfeNfcePdfUrl(d: DanfeNfceCompleto): Promise<string> {
  const qrImg = d.qrCode
    ? await QRCode.toDataURL(d.qrCode, { margin: 1, width: 240, errorCorrectionLevel: "M" })
    : null;

  let logo: LogoDanfe = null;
  const logoDataUrl = await carregarLogoDanfe();
  if (logoDataUrl) {
    const { w, h, formato } = await tamanhoLogoDanfeMm(logoDataUrl);
    if (w > 0 && h > 0) logo = { dataUrl: logoDataUrl, w, h, formato };
  }

  const ambienteHomolog = d.ambiente === 2 || d.tpAmb === 2;

  // 1ª passada: mede a altura necessária.
  const medidor = new jsPDF({ unit: "mm", format: [LARGURA_MM, 1000] });
  const ctxMedida: Ctx = {
    doc: medidor,
    y: 0,
    measure: true,
    qrImg,
    logo,
    ambienteHomolog,
  };
  const altura = desenhar(ctxMedida, d);

  // 2ª passada: desenha de fato no tamanho calculado.
  const doc = new jsPDF({ unit: "mm", format: [LARGURA_MM, Math.max(60, Math.ceil(altura))] });
  const ctx: Ctx = {
    doc,
    y: 0,
    measure: false,
    qrImg,
    logo,
    ambienteHomolog,
  };
  desenhar(ctx, d);

  const blob = doc.output("blob");
  return URL.createObjectURL(blob);
}
