/**
 * NFS-e nacional (DPS): séries 00001–10000 são do sistema municipal.
 * Emissão por API deve usar 10001–49999 (erro L0022 em Belém).
 */
export const SERIE_DPS_NACIONAL_MIN = 10001;
export const SERIE_DPS_NACIONAL_MAX = 49999;
export const SERIE_DPS_NACIONAL_PADRAO = "10001";

export function normalizarSerieDpsNacional(
  raw: string | number | null | undefined,
): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  const n = Number(d);
  if (!Number.isInteger(n) || n < SERIE_DPS_NACIONAL_MIN || n > SERIE_DPS_NACIONAL_MAX) {
    return null;
  }
  return String(n);
}
