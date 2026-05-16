/** Layout compartilhado entre jsPDF (browser) e pdf-lib (servidor). */

export const MARGEM_ASSINATURA_DIGITAL_PT = 48;
export const LARGURA_CAIXA_ASSINATURA_DIGITAL_PT = 292;
export const ALTURA_CAIXA_ASSINATURA_DIGITAL_PT = 68;
/** Espaço entre a imagem da assinatura do paciente e o bloco digital. */
export const ESPACO_APOS_ASSINATURA_PACIENTE_PT = 14;
/** Rótulo "Assinatura digital da clínica" + folga. */
export const TITULO_ASSINATURA_DIGITAL_PT = 22;

export const METADATA_SUBJECT_PREFIX = "podoquiro_sig:";

export type MetadadosPosicaoAssinaturaDigital = {
  /** Índice da página (0 = primeira). */
  pageIndex: number;
  /** Coordenada Y do topo da caixa (origem no canto superior, como no jsPDF). */
  yTopCaixaPt: number;
};

export function serializarMetadadosPosicaoAssinaturaDigital(
  meta: MetadadosPosicaoAssinaturaDigital,
): string {
  return `${METADATA_SUBJECT_PREFIX}${JSON.stringify(meta)}`;
}

export function parsearMetadadosPosicaoAssinaturaDigital(
  subject: string | undefined,
): MetadadosPosicaoAssinaturaDigital | null {
  if (!subject?.startsWith(METADATA_SUBJECT_PREFIX)) return null;
  try {
    const raw = subject.slice(METADATA_SUBJECT_PREFIX.length);
    const parsed = JSON.parse(raw) as MetadadosPosicaoAssinaturaDigital;
    if (
      typeof parsed.pageIndex !== "number" ||
      typeof parsed.yTopCaixaPt !== "number" ||
      !Number.isFinite(parsed.pageIndex) ||
      !Number.isFinite(parsed.yTopCaixaPt)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Converte Y superior (jsPDF) para retângulo PDF [x1,y1,x2,y2] (origem inferior). */
export function retanguloPdfDeYSuperior(
  pageH: number,
  yTopCaixaPt: number,
  margem = MARGEM_ASSINATURA_DIGITAL_PT,
  largura = LARGURA_CAIXA_ASSINATURA_DIGITAL_PT,
  altura = ALTURA_CAIXA_ASSINATURA_DIGITAL_PT,
): [number, number, number, number] {
  const x1 = margem;
  const x2 = margem + largura;
  const y2 = pageH - yTopCaixaPt;
  const y1 = y2 - altura;
  return [x1, y1, x2, y2];
}
