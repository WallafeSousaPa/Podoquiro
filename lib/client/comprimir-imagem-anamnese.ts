/** Limite seguro para soma dos anexos (multipart tem overhead; serverless ~4,5 MB). */
export const MAX_TOTAL_ANEXOS_ANAMNESE_BYTES = Math.floor(3.5 * 1024 * 1024);

const MAX_LADO_PX = 1920;
const QUALIDADE_JPEG = 0.82;

export function somaTamanhosArquivos(files: (File | null | undefined)[]): number {
  let t = 0;
  for (const f of files) {
    if (f && f.size > 0) t += f.size;
  }
  return t;
}

/**
 * Redimensiona e converte para JPEG para caber no limite de payload em mobile/serverless.
 * Falhas silenciosas devolvem o arquivo original.
 */
export async function comprimirImagemParaAnamnese(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 0) return file;
  try {
    const bmp = await createImageBitmap(file);
    try {
      let w = bmp.width;
      let h = bmp.height;
      if (w > MAX_LADO_PX || h > MAX_LADO_PX) {
        if (w >= h) {
          h = Math.round((h * MAX_LADO_PX) / w);
          w = MAX_LADO_PX;
        } else {
          w = Math.round((w * MAX_LADO_PX) / h);
          h = MAX_LADO_PX;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bmp, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", QUALIDADE_JPEG);
      });
      if (!blob) return file;
      const base = file.name.replace(/\.[^.]+$/i, "").trim() || "foto";
      const novo = new File([blob], `${base}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
      return novo.size < file.size ? novo : file;
    } finally {
      bmp.close();
    }
  } catch {
    return file;
  }
}
