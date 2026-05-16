/** Canvas de assinatura do termo — compatível com mobile (Safari/iOS). */

const ALTURA_CSS_PT = 200;
const LARGURA_MAX_CSS_PT = 880;
const DPR_MAX = 2;
const JPEG_QUALIDADE = 0.78;
const LARGURA_MAX_EXPORT_PX = 520;

export function dimensoesCanvasAssinaturaTermo(): { cssW: number; cssH: number } {
  const cssW =
    typeof window !== "undefined"
      ? Math.min(LARGURA_MAX_CSS_PT, Math.max(240, window.innerWidth - 48))
      : LARGURA_MAX_CSS_PT;
  return { cssW, cssH: ALTURA_CSS_PT };
}

/** Configura resolução do canvas (DPR limitado) para telas de alta densidade. */
export function prepararCanvasAssinaturaTermo(canvas: HTMLCanvasElement): void {
  const { cssW, cssH } = dimensoesCanvasAssinaturaTermo();
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, DPR_MAX);

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

/** Coordenadas em pixels CSS (alinha com o contexto escalado por DPR). */
export function coordsCanvasAssinatura(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

/** JPEG reduzido para PDF menor e upload estável no celular. */
export function exportarAssinaturaTermoJpeg(canvas: HTMLCanvasElement): string {
  const { cssW, cssH } = dimensoesCanvasAssinaturaTermo();
  const escala = Math.min(1, LARGURA_MAX_EXPORT_PX / Math.max(canvas.width, 1));
  const outW = Math.max(1, Math.round(cssW * escala));
  const outH = Math.max(1, Math.round(cssH * escala));

  const off = document.createElement("canvas");
  off.width = outW;
  off.height = outH;
  const ctx = off.getContext("2d");
  if (!ctx) {
    return canvas.toDataURL("image/jpeg", JPEG_QUALIDADE);
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(canvas, 0, 0, outW, outH);
  return off.toDataURL("image/jpeg", JPEG_QUALIDADE);
}
