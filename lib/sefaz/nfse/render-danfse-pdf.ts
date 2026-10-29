import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { DadosDanfse } from "./parse-nfse-xml";

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function fmtDoc(doc: string): string {
  const d = soDigitos(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return doc.trim();
}

function fmtBrl(v: string | number): string {
  const n = typeof v === "number" ? v : Number(String(v || "0").replace(",", "."));
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDataHora(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  const d = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (d) return `${d[3]}/${d[2]}/${d[1]}`;
  return iso.trim();
}

function chaveBlocos(chave: string): string {
  const d = soDigitos(chave);
  return (d.match(/.{1,5}/g) ?? [d]).join(" ");
}

function linha(doc: jsPDF, x1: number, y: number, x2: number) {
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.25);
  doc.line(x1, y, x2, y);
}

function caixa(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);
}

function rotulo(doc: jsPDF, texto: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text(texto, x, y);
}

function valor(doc: jsPDF, texto: string, x: number, y: number, size = 9) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(20, 20, 20);
  doc.text(texto || "—", x, y);
}

export async function renderDanfsePdfBuffer(d: DadosDanfse): Promise<Buffer> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 12;
  const R = 198;
  const W = R - L;
  let y = 12;

  caixa(doc, L, y, W, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text("DANFSe", L + 4, y + 8);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Documento Auxiliar da NFS-e", L + 4, y + 13);
  doc.text(d.municipioEmi || "Belém / PA", L + 4, y + 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`NFS-e nº ${d.numero || "—"}`, R - 4, y + 8, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (d.serie) doc.text(`Série ${d.serie}`, R - 4, y + 13, { align: "right" });
  doc.text(fmtDataHora(d.dhEmi) || d.competencia, R - 4, y + 18, { align: "right" });
  y += 26;

  caixa(doc, L, y, W, 22);
  rotulo(doc, "PRESTADOR DE SERVIÇOS", L + 3, y + 5);
  valor(doc, d.prestadorNome, L + 3, y + 11, 10);
  valor(
    doc,
    `CNPJ ${fmtDoc(d.prestadorCnpj)}${d.prestadorIm ? `    IM ${d.prestadorIm}` : ""}`,
    L + 3,
    y + 17,
    8,
  );
  y += 26;

  caixa(doc, L, y, W, 24);
  rotulo(doc, "TOMADOR DE SERVIÇOS", L + 3, y + 5);
  valor(doc, d.tomadorNome, L + 3, y + 11, 10);
  valor(doc, `CPF/CNPJ ${fmtDoc(d.tomadorDoc)}`, L + 3, y + 17, 8);
  if (d.tomadorEndereco) valor(doc, d.tomadorEndereco, L + 3, y + 22, 7);
  y += 28;

  const desc = d.discriminacao || "Serviços prestados";
  const linhas = doc.splitTextToSize(desc, W - 8) as string[];
  const hServ = Math.max(22, 12 + linhas.length * 4);
  caixa(doc, L, y, W, hServ);
  rotulo(doc, "DISCRIMINAÇÃO DOS SERVIÇOS", L + 3, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text(linhas, L + 3, y + 11);
  y += hServ + 4;

  caixa(doc, L, y, W, 14);
  rotulo(doc, "VALOR TOTAL DA NFS-e", L + 3, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(fmtBrl(d.valor), R - 4, y + 10, { align: "right" });
  y += 18;

  const chave50 = soDigitos(d.chave);
  const qrAlvo =
    chave50.length >= 44
      ? `https://www.nfse.gov.br/consultapublica?chave=${chave50}`
      : d.chave;
  let qrData = "";
  try {
    qrData = await QRCode.toDataURL(qrAlvo, { margin: 0, width: 160, errorCorrectionLevel: "M" });
  } catch {
    qrData = "";
  }

  caixa(doc, L, y, W, 36);
  rotulo(doc, "CHAVE DE ACESSO", L + 3, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text(chaveBlocos(d.chave), L + 3, y + 12);
  if (d.codigoVerificacao) {
    valor(doc, `Código de verificação: ${d.codigoVerificacao}`, L + 3, y + 18, 8);
  }
  valor(doc, "Consulte em www.nfse.gov.br (Consulta Pública) com a chave de acesso.", L + 3, y + 24, 7);
  if (qrData) {
    doc.addImage(qrData, "PNG", R - 34, y + 4, 28, 28);
  }

  y = 282;
  linha(doc, L, y, R);
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(
    "Documento gerado a partir da NFS-e autorizada pela Prefeitura de Belém.",
    L,
    y + 5,
  );

  return Buffer.from(doc.output("arraybuffer"));
}
