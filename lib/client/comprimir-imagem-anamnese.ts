/** Limite seguro para soma dos anexos (multipart tem overhead; serverless ~4,5 MB). */
export const MAX_TOTAL_ANEXOS_ANAMNESE_BYTES = Math.floor(3.5 * 1024 * 1024);

/** PDF do termo com assinatura virtual (jsPDF) — aviso se ultrapassar. */
export const MAX_BYTES_PDF_TERMO_ASSINATURA = Math.floor(1.5 * 1024 * 1024);

const MAX_LADO_PX = 1280;
const MAX_LADO_PX_AGRESSIVO = 960;
const QUALIDADE_INICIAL = 0.78;
const QUALIDADE_MIN = 0.48;
const PASSO_QUALIDADE = 0.07;
/** Meta por imagem quando há várias fotos no mesmo envio. */
const MAX_BYTES_POR_IMAGEM = 650_000;

export function somaTamanhosArquivos(files: (File | null | undefined)[]): number {
  let t = 0;
  for (const f of files) {
    if (f && f.size > 0) t += f.size;
  }
  return t;
}

function nomeBaseArquivo(file: File): string {
  return file.name.replace(/\.[^.]+$/i, "").trim() || "foto";
}

function redimensionar(w: number, h: number, maxLado: number): { w: number; h: number } {
  if (w <= maxLado && h <= maxLado) return { w, h };
  if (w >= h) {
    return { w: maxLado, h: Math.round((h * maxLado) / w) };
  }
  return { w: Math.round((w * maxLado) / h), h: maxLado };
}

async function desenharArquivoNoCanvas(
  file: File,
  maxLado: number,
): Promise<{ canvas: HTMLCanvasElement; cleanup: () => void } | null> {
  let cleanup = () => {};
  try {
    const bmp = await createImageBitmap(file);
    try {
      const { w, h } = redimensionar(bmp.width, bmp.height, maxLado);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0, w, h);
      return { canvas, cleanup };
    } finally {
      bmp.close();
    }
  } catch {
    /* createImageBitmap falha em alguns HEIC/WebP antigos — fallback com <img>. */
  }

  const url = URL.createObjectURL(file);
  cleanup = () => URL.revokeObjectURL(url);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("imagem_invalida"));
      el.src = url;
    });
    const { w, h } = redimensionar(img.naturalWidth, img.naturalHeight, maxLado);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas, cleanup };
  } catch {
    cleanup();
    return null;
  }
}

function canvasParaJpeg(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", qualidade);
  });
}

async function comprimirCanvasParaFile(
  canvas: HTMLCanvasElement,
  nomeBase: string,
  maxBytes: number,
): Promise<File | null> {
  let melhor: File | null = null;
  let qualidade = QUALIDADE_INICIAL;

  while (qualidade >= QUALIDADE_MIN) {
    const blob = await canvasParaJpeg(canvas, qualidade);
    if (!blob) break;
    const f = new File([blob], `${nomeBase}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    if (!melhor || f.size < melhor.size) melhor = f;
    if (f.size <= maxBytes) return f;
    qualidade -= PASSO_QUALIDADE;
  }

  if (melhor) return melhor;

  const blobMin = await canvasParaJpeg(canvas, QUALIDADE_MIN);
  if (!blobMin) return null;
  return new File([blobMin], `${nomeBase}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

/**
 * Redimensiona e converte para JPEG para caber no limite de payload em mobile/serverless.
 * Se não conseguir processar, devolve o arquivo original.
 */
export async function comprimirImagemParaAnamnese(
  file: File,
  maxBytes: number = MAX_BYTES_POR_IMAGEM,
): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 0) return file;

  const nomeBase = nomeBaseArquivo(file);

  for (const maxLado of [MAX_LADO_PX, MAX_LADO_PX_AGRESSIVO]) {
    const drawn = await desenharArquivoNoCanvas(file, maxLado);
    if (!drawn) continue;
    try {
      const comprimido = await comprimirCanvasParaFile(drawn.canvas, nomeBase, maxBytes);
      if (comprimido) {
        if (comprimido.size <= maxBytes || comprimido.size < file.size) {
          return comprimido;
        }
      }
    } finally {
      drawn.cleanup();
    }
  }

  return file;
}

/** Mensagem quando o total (fotos + PDF) ultrapassa o limite do servidor. */
export function mensagemAnexosGrandesDemais(totalBytes: number): string {
  const mb = (totalBytes / (1024 * 1024)).toFixed(1);
  return (
    `Os anexos somam ~${mb} MB após compressão (máximo ~3,5 MB). ` +
    `Envie menos fotos, use imagens menores ou salve sem o PDF do termo e anexe depois.`
  );
}

/** Mensagem quando só o PDF do termo assinado é grande demais. */
export function mensagemPdfTermoGrandeDemais(bytes: number): string {
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return (
    `O PDF do termo com assinatura (~${mb} MB) é grande demais para enviar junto com as fotos. ` +
    `Tente gerar o termo novamente ou salve a anamnese sem as fotos e envie o PDF em outro momento.`
  );
}
