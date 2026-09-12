/** DANFE NF-e (modelo 55) no layout oficial A4 retrato — apenas no browser. */

import { jsPDF } from "jspdf";
import type { DanfeNfeDados } from "@/lib/sefaz/nfe/parse-nfe-danfe";

export type DanfeNfeCompleto = DanfeNfeDados & {
  ambiente: number;
  chave: string | null;
  protocolo: string | null;
};

const LOGO_PUBLICO = "/PeNaEntregaLogo.png";
const LOGO_MAX_W = 30;
const LOGO_MAX_H = 32;

/** Padrões Code 128 (larguras bar/espaço), índices 0–106. */
const C128 = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];

function brl(valor: string | number): string {
  const n = typeof valor === "number" ? valor : Number(String(valor || "0").replace(",", "."));
  if (!Number.isFinite(n)) return "0,00";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function num(v: string, frac = 2): string {
  const n = Number(String(v || "0").replace(",", "."));
  if (!Number.isFinite(n)) return "0,00";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

function fmtDataHora(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

function fmtData(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function chaveEmBlocos(chave: string | null): string {
  const c = (chave ?? "").replace(/\D/g, "");
  return c.replace(/(.{4})/g, "$1 ").trim();
}

function fmtCep(cep: string): string {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return cep.trim();
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function fmtDoc(doc: string, tipo: "CPF" | "CNPJ" | null): string {
  const d = doc.replace(/\D/g, "");
  if (tipo === "CPF" || d.length === 11) {
    if (d.length !== 11) return doc || "";
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return doc || "";
}

function fmtFone(fone: string): string {
  const d = fone.replace(/\D/g, "");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  return fone.trim();
}

function fmtNNF(n: string): string {
  const d = String(n || "").replace(/\D/g, "").padStart(9, "0").slice(-9);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
}

function fmtSerie(s: string): string {
  const d = String(s || "").replace(/\D/g, "") || "0";
  return d.padStart(3, "0");
}

function modFreteLabel(m: string): string {
  if (m === "0") return "0-Emitente";
  if (m === "1") return "1-Destinatário";
  if (m === "2") return "2-Terceiros";
  if (m === "3") return "3-Próprio remetente";
  if (m === "4") return "4-Próprio destinatário";
  if (m === "9") return "9-Sem Transporte";
  return m || "";
}

function desenharCode128(doc: jsPDF, texto: string, x: number, y: number, w: number, h: number) {
  const digits = texto.replace(/\D/g, "");
  if (digits.length < 2 || digits.length % 2 !== 0) return;
  const values = [105];
  for (let i = 0; i < digits.length; i += 2) {
    values.push(Number(digits.slice(i, i + 2)));
  }
  let sum = values[0]!;
  for (let i = 1; i < values.length; i++) sum += values[i]! * i;
  values.push(sum % 103);
  const padroes = values.map((v) => C128[v] ?? C128[0]!);
  padroes.push(C128[106]!);
  const totalMod = padroes.reduce((s, p) => s + [...p].reduce((a, c) => a + Number(c), 0), 0);
  const modulo = w / totalMod;
  let cx = x;
  doc.setFillColor(0, 0, 0);
  for (const p of padroes) {
    let bar = true;
    for (const ch of p) {
      const larg = Number(ch) * modulo;
      if (bar) doc.rect(cx, y, larg, h, "F");
      cx += larg;
      bar = !bar;
    }
  }
}

function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function carregarLogo(): Promise<{ dataUrl: string; w: number; h: number; formato: "JPEG" | "PNG" } | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(`${window.location.origin}${LOGO_PUBLICO}`, { cache: "force-cache" });
    if (!res.ok) return null;
    const dataUrl = await blobParaDataUrl(await res.blob());
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const nw = img.naturalWidth || img.width;
        const nh = img.naturalHeight || img.height;
        if (!nw || !nh) {
          resolve(null);
          return;
        }
        const aspect = nw / nh;
        let w = LOGO_MAX_W;
        let h = w / aspect;
        if (h > LOGO_MAX_H) {
          h = LOGO_MAX_H;
          w = h * aspect;
        }
        resolve({
          dataUrl,
          w,
          h,
          formato: dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG",
        });
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  } catch {
    return null;
  }
}

/** Gera o PDF do DANFE (layout oficial) e retorna uma URL de objeto (blob). */
export async function gerarDanfeNfePdfUrl(d: DanfeNfeCompleto): Promise<string> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageW = 210;
  const pageH = 297;
  const x0 = 7;
  const x1 = 203;
  const w = x1 - x0;
  let y = 7;
  const homolog = d.ambiente === 2 || d.tpAmb === 2;
  const chave = (d.chave ?? "").replace(/\D/g, "");
  const logo = await carregarLogo();

  const stroke = () => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
  };

  const box = (x: number, yy: number, ww: number, hh: number) => {
    stroke();
    doc.rect(x, yy, ww, hh);
  };

  const titulo = (s: string, x: number, yy: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.8);
    doc.setTextColor(60, 60, 60);
    doc.text(s, x, yy);
    doc.setTextColor(0, 0, 0);
  };

  const val = (
    s: string,
    x: number,
    yy: number,
    size = 7.5,
    bold = false,
    align?: "left" | "center" | "right",
  ) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
    if (align) doc.text(s || "", x, yy, { align });
    else doc.text(s || "", x, yy);
  };

  const celula = (
    x: number,
    yy: number,
    ww: number,
    hh: number,
    t: string,
    v: string,
    size = 7.5,
  ) => {
    box(x, yy, ww, hh);
    titulo(t, x + 1, yy + 2.8);
    val(v, x + 1, yy + hh - 2.2, size, true);
  };

  if (homolog) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(180, 0, 0);
    doc.text("NF-e EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL", pageW / 2, y + 3, {
      align: "center",
    });
    y += 6;
    doc.setTextColor(0, 0, 0);
  }

  // —— Canhoto de recebimento (igual ao DANFE impresso) ——
  const hCanhoto = 22;
  const wNf = 38;
  const xNf = x0 + w - wNf;
  box(x0, y, w - wNf, hCanhoto);
  box(xNf, y, wNf, hCanhoto);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  const rec = `RECEBEMOS DE ${d.emit.xNome || "EMITENTE"} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO`;
  doc.text(doc.splitTextToSize(rec, w - wNf - 4), x0 + 1.5, y + 4);

  const hRec = 11;
  const yRec = y + hCanhoto - hRec;
  box(x0, yRec, 46, hRec);
  box(x0 + 46, yRec, w - wNf - 46, hRec);
  titulo("DATA DE RECEBIMENTO", x0 + 1.5, yRec + 3);
  titulo("IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR", x0 + 47.5, yRec + 3);

  const cxNf = xNf + wNf / 2;
  val("NF-e", cxNf, y + 6, 10, true, "center");
  val(`Nº ${fmtNNF(d.nNF)}`, cxNf, y + 12, 8, true, "center");
  val(`Série ${fmtSerie(d.serie)}`, cxNf, y + 17.5, 8, false, "center");

  y += hCanhoto + 3.2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.2);
  doc.setTextColor(80, 80, 80);
  doc.text("Corte na linha pontilhada", pageW / 2, y - 0.4, { align: "center" });
  doc.setTextColor(0, 0, 0);
  doc.setLineDashPattern([0.9, 0.7], 0);
  stroke();
  doc.line(x0, y, x1, y);
  doc.setLineDashPattern([], 0);
  y += 3;

  // —— Identificação emitente + DANFE + chave ——
  const hId = 36;
  const wEmit = 92;
  const wDanfe = 36;
  const wChave = w - wEmit - wDanfe;
  box(x0, y, wEmit, hId);
  box(x0 + wEmit, y, wDanfe, hId);
  box(x0 + wEmit + wDanfe, y, wChave, hId);

  let xTexto = x0 + 2;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.formato, x0 + 2, y + 2, logo.w, logo.h);
      xTexto = x0 + 2 + logo.w + 2;
    } catch {
      /* sem logo */
    }
  }
  val(d.emit.xFant || d.emit.xNome, xTexto, y + 6, 9, true);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const endEmit = [
    [d.emit.xLgr, d.emit.nro].filter(Boolean).join(", "),
    d.emit.xCpl,
    d.emit.xBairro,
    `${d.emit.xMun} / ${d.emit.uf}`,
    d.emit.cep ? `CEP ${fmtCep(d.emit.cep)}` : "",
    d.emit.fone ? `Fone: ${fmtFone(d.emit.fone)}` : "",
  ]
    .filter((s) => s && s.trim())
    .join("\n");
  doc.text(doc.splitTextToSize(endEmit, wEmit - (xTexto - x0) - 3), xTexto, y + 10.5);

  const cxDanfe = x0 + wEmit + wDanfe / 2;
  val("DANFE", cxDanfe, y + 5.5, 11, true, "center");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.text("Documento Auxiliar da", cxDanfe, y + 9.5, { align: "center" });
  doc.text("Nota Fiscal Eletrônica", cxDanfe, y + 12.5, { align: "center" });
  doc.setFontSize(6.5);
  doc.text("0 - ENTRADA", x0 + wEmit + 3, y + 18.5);
  doc.text("1 - SAÍDA", x0 + wEmit + 3, y + 22.5);
  box(x0 + wEmit + 24, y + 16, 8, 8);
  val(d.tpNF === "0" ? "0" : "1", x0 + wEmit + 28, y + 21.8, 12, true, "center");
  val(`Nº ${fmtNNF(d.nNF)}`, cxDanfe, y + 28.2, 8, true, "center");
  val(`Série ${fmtSerie(d.serie)}`, cxDanfe, y + 32, 7, false, "center");
  val("Folha 1/1", cxDanfe, y + 35, 7, false, "center");

  const xBar = x0 + wEmit + wDanfe + 2;
  titulo("CHAVE DE ACESSO", xBar, y + 2.8);
  if (chave.length === 44) {
    desenharCode128(doc, chave, xBar, y + 4.2, wChave - 4, 8);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.text(chaveEmBlocos(chave), x0 + wEmit + wDanfe + wChave / 2, y + 14.4, {
    align: "center",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.text(
    doc.splitTextToSize(
      "Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora",
      wChave - 4,
    ),
    xBar,
    y + 18.2,
  );
  titulo("PROTOCOLO DE AUTORIZAÇÃO DE USO", xBar, y + 27);
  val(
    d.protocolo ? `${d.protocolo}  ${fmtDataHora(d.dhEmi)}` : "",
    xBar,
    y + 32,
    6.5,
    true,
  );

  y += hId;

  celula(x0, y, w, 8, "NATUREZA DA OPERAÇÃO", d.natOp, 8);
  y += 8;

  celula(x0, y, 65, 8, "INSCRIÇÃO ESTADUAL", d.emit.ie, 8);
  celula(x0 + 65, y, 65, 8, "INSCRIÇÃO ESTADUAL DO SUBST. TRIB.", d.emit.ieST, 8);
  celula(x0 + 130, y, w - 130, 8, "CNPJ", fmtDoc(d.emit.cnpj, "CNPJ"), 8);
  y += 8;

  // —— Destinatário / Remetente ——
  titulo("DESTINATÁRIO / REMETENTE", x0, y + 3);
  y += 4;
  celula(x0, y, 118, 8, "NOME / RAZÃO SOCIAL", d.dest.xNome, 7);
  celula(x0 + 118, y, 42, 8, "CNPJ / CPF", fmtDoc(d.dest.doc, d.dest.tipoDoc), 7);
  celula(x0 + 160, y, w - 160, 8, "DATA DA EMISSÃO", fmtData(d.dhEmi), 7);
  y += 8;
  celula(x0, y, 90, 8, "ENDEREÇO", [d.dest.xLgr, d.dest.nro].filter(Boolean).join(", "), 7);
  celula(x0 + 90, y, 50, 8, "BAIRRO / DISTRITO", d.dest.xBairro, 7);
  celula(x0 + 140, y, 20, 8, "CEP", fmtCep(d.dest.cep), 7);
  celula(x0 + 160, y, w - 160, 8, "DATA DA SAÍDA/ENTRADA", fmtData(d.dhSaiEnt || d.dhEmi), 7);
  y += 8;
  celula(x0, y, 78, 8, "MUNICÍPIO", d.dest.xMun, 7);
  celula(x0 + 78, y, 32, 8, "FONE / FAX", fmtFone(d.dest.fone), 7);
  celula(x0 + 110, y, 14, 8, "UF", d.dest.uf, 7);
  celula(x0 + 124, y, 36, 8, "INSCRIÇÃO ESTADUAL", d.dest.ie, 7);
  celula(x0 + 160, y, w - 160, 8, "HORA DA SAÍDA", fmtDataHora(d.dhSaiEnt || d.dhEmi).slice(11), 7);
  y += 8;

  // —— Fatura ——
  titulo("FATURA / DUPLICATA", x0, y + 3);
  y += 4;
  box(x0, y, w, 8);
  y += 8;

  // —— Cálculo do imposto ——
  titulo("CÁLCULO DO IMPOSTO", x0, y + 3);
  y += 4;
  const colImp = w / 5;
  celula(x0, y, colImp, 8, "BASE DE CÁLC. DO ICMS", brl(d.totais.vBC));
  celula(x0 + colImp, y, colImp, 8, "VALOR DO ICMS", brl(d.totais.vICMS));
  celula(x0 + colImp * 2, y, colImp, 8, "BASE DE CÁLC. ICMS ST", brl(d.totais.vBCST));
  celula(x0 + colImp * 3, y, colImp, 8, "VALOR DO ICMS ST", brl(d.totais.vST));
  celula(x0 + colImp * 4, y, colImp, 8, "VALOR TOTAL DOS PRODUTOS", brl(d.totais.vProd));
  y += 8;
  const colImp2 = w / 6;
  celula(x0, y, colImp2, 8, "VALOR DO FRETE", brl(d.totais.vFrete));
  celula(x0 + colImp2, y, colImp2, 8, "VALOR DO SEGURO", brl(d.totais.vSeg));
  celula(x0 + colImp2 * 2, y, colImp2, 8, "DESCONTO", brl(d.totais.vDesc));
  celula(x0 + colImp2 * 3, y, colImp2, 8, "OUTRAS DESPESAS", brl(d.totais.vOutro));
  celula(x0 + colImp2 * 4, y, colImp2, 8, "VALOR DO IPI", brl(d.totais.vIPI));
  celula(x0 + colImp2 * 5, y, colImp2, 8, "VALOR TOTAL DA NOTA", brl(d.totais.vNF), 8);
  y += 8;

  // —— Transportador / volumes ——
  titulo("TRANSPORTADOR / VOLUMES TRANSPORTADOS", x0, y + 3);
  y += 4;
  celula(x0, y, 86, 8, "NOME / RAZÃO SOCIAL", d.transp.xNome, 7);
  celula(x0 + 86, y, 32, 8, "FRETE POR CONTA", modFreteLabel(d.transp.modFrete), 6.5);
  celula(x0 + 118, y, 28, 8, "CÓDIGO ANTT", "", 7);
  celula(x0 + 148, y, 26, 8, "PLACA DO VEÍCULO", "", 7);
  celula(x0 + 174, y, 8, 8, "UF", d.transp.uf, 7);
  celula(x0 + 182, y, w - 182, 8, "CNPJ / CPF", fmtDoc(d.transp.cnpj, d.transp.cnpj.length === 14 ? "CNPJ" : null), 6.5);
  y += 8;
  celula(x0, y, 86, 8, "ENDEREÇO", d.transp.xEnder, 7);
  celula(x0 + 86, y, 50, 8, "MUNICÍPIO", d.transp.xMun, 7);
  celula(x0 + 136, y, 10, 8, "UF", d.transp.uf, 7);
  celula(x0 + 146, y, w - 146, 8, "INSCRIÇÃO ESTADUAL", d.transp.ie, 7);
  y += 8;
  celula(x0, y, 24, 8, "QUANTIDADE", d.transp.qVol, 7);
  celula(x0 + 24, y, 36, 8, "ESPÉCIE", d.transp.esp, 7);
  celula(x0 + 60, y, 36, 8, "MARCA", d.transp.marca, 7);
  celula(x0 + 96, y, 36, 8, "NUMERAÇÃO", d.transp.nVol, 7);
  celula(x0 + 132, y, 32, 8, "PESO BRUTO", d.transp.pesoB, 7);
  celula(x0 + 164, y, w - 164, 8, "PESO LÍQUIDO", d.transp.pesoL, 7);
  y += 8;

  // —— Produtos ——
  titulo("DADOS DOS PRODUTOS / SERVIÇOS", x0, y + 3);
  y += 4;
  const colDefs = [
    { t: "CÓDIGO", w: 14 },
    { t: "DESCRIÇÃO DOS PRODUTOS / SERVIÇOS", w: 48 },
    { t: "NCM/SH", w: 14 },
    { t: "CST", w: 8 },
    { t: "CFOP", w: 8 },
    { t: "UN", w: 6 },
    { t: "QUANT.", w: 12 },
    { t: "V. UNITÁRIO", w: 15 },
    { t: "V. TOTAL", w: 13 },
    { t: "BC ICMS", w: 12 },
    { t: "V. ICMS", w: 11 },
    { t: "V. IPI", w: 10 },
    { t: "ALIQ.\nICMS", w: 13 },
    { t: "ALIQ.\nIPI", w: 12 },
  ];
  const somaCols = colDefs.reduce((s, c) => s + c.w, 0);
  const cols = colDefs.map((c, i) => {
    if (i === colDefs.length - 1) {
      const usados = colDefs.slice(0, -1).reduce((s, x) => s + (x.w * w) / somaCols, 0);
      return { t: c.t, w: w - usados };
    }
    return { t: c.t, w: (c.w * w) / somaCols };
  });
  const hHead = 7;
  let cx = x0;
  doc.setFillColor(245, 245, 245);
  doc.rect(x0, y, w, hHead, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.4);
  for (const c of cols) {
    box(cx, y, c.w, hHead);
    const linhasTit = c.t.split("\n");
    linhasTit.forEach((ln, i) => {
      const tit = doc.splitTextToSize(ln, Math.max(2, c.w - 0.8));
      doc.text(Array.isArray(tit) ? tit[0]! : tit, cx + c.w / 2, y + 2.5 + i * 2.3, {
        align: "center",
      });
    });
    cx += c.w;
  }
  y += hHead;

  const hLinha = 6;
  const yProdutosFim = pageH - 42;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  for (const it of d.itens) {
    if (y + hLinha > yProdutosFim) {
      box(x0, y, w, yProdutosFim - y);
      y = yProdutosFim;
      break;
    }
    cx = x0;
    const vals = [
      it.cProd.slice(0, 10),
      it.xProd,
      it.ncm,
      it.cst,
      it.cfop,
      it.uCom,
      num(it.qCom, 4),
      brl(it.vUnCom),
      brl(it.vProd),
      brl(it.vBc || "0"),
      brl(it.vIcms || "0"),
      brl(it.vIpi || "0"),
      it.pIcms ? `${num(it.pIcms, 2)}%` : "",
      it.pIpi ? `${num(it.pIpi, 2)}%` : "",
    ];
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]!;
      box(cx, y, c.w, hLinha);
      const txt = doc.splitTextToSize(vals[i] || "", Math.max(2, c.w - 1));
      const linhaTxt = Array.isArray(txt) ? txt[0]! : txt;
      doc.text(linhaTxt, cx + 0.4, y + 4, { maxWidth: Math.max(1.5, c.w - 0.8) });
      cx += c.w;
    }
    y += hLinha;
  }
  if (y < yProdutosFim) {
    box(x0, y, w, yProdutosFim - y);
    y = yProdutosFim;
  }

  // —— Dados adicionais ——
  titulo("DADOS ADICIONAIS", x0, y + 3);
  y += 4;
  const hAdic = pageH - y - 7;
  box(x0, y, w * 0.62, hAdic);
  box(x0 + w * 0.62, y, w * 0.38, hAdic);
  titulo("INFORMAÇÕES COMPLEMENTARES", x0 + 1, y + 3);
  titulo("RESERVADO AO FISCO", x0 + w * 0.62 + 1, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const extras = [
    d.infCpl,
    homolog ? "NF-e emitida em ambiente de homologação — sem valor fiscal." : "",
    d.dest.email ? `E-mail: ${d.dest.email}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (extras) {
    doc.text(doc.splitTextToSize(extras, w * 0.62 - 3), x0 + 1, y + 7);
  }

  const blob = doc.output("blob");
  return URL.createObjectURL(blob);
}
