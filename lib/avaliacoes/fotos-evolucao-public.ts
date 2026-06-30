import {
  CAMPOS_FOTO_EVOLUCAO,
  type CampoFotoEvolucao,
} from "@/lib/avaliacoes/evolucao";

export const BUCKET_EVOLUCAO_ANALISE = "evolucao_analise";

export const ROTULOS_FOTO_EVOLUCAO: Record<CampoFotoEvolucao, string> = {
  foto_plantar_direito: "Plantar direito",
  foto_plantar_esquerdo: "Plantar esquerdo",
  foto_dorso_direito: "Dorso direito",
  foto_dorso_esquerdo: "Dorso esquerdo",
  foto_doc_termo_consentimento: "Termo consentimento",
};

export type FotoComRotulo = {
  label: string;
  url: string;
};

export function urlFotoEvolucaoPublica(
  supabaseUrl: string,
  path: string | null | undefined,
): string | null {
  if (!path?.trim() || !supabaseUrl.trim()) return null;
  const base = supabaseUrl.replace(/\/$/, "");
  const p = path.trim().replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/${BUCKET_EVOLUCAO_ANALISE}/${p}`;
}

/** Monta lista de fotos da anamnese com URLs públicas do bucket evolucao_analise. */
export function montarFotosAnamnese(
  row: Record<string, unknown>,
  supabaseUrl: string,
): FotoComRotulo[] {
  const fotos: FotoComRotulo[] = [];
  for (const campo of CAMPOS_FOTO_EVOLUCAO) {
    const url = urlFotoEvolucaoPublica(supabaseUrl, optPath(row[campo]));
    if (url) {
      fotos.push({ label: ROTULOS_FOTO_EVOLUCAO[campo], url });
    }
  }
  return fotos;
}

function optPath(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}
