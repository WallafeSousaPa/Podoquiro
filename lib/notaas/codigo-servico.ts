/**
 * Converte código LC 116 para cTribNac (6 dígitos) exigido pela Notaas.
 * Ex.: "06.01" → "060101", "6.1" → "060100", "060101" → "060101"
 */
export function normalizarCodigoServicoLc116(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  const soDigitos = t.replace(/\D/g, "");
  if (soDigitos.length === 6) return soDigitos;

  const m = t.match(/^(\d{1,2})\s*[.\-/]\s*(\d{1,2})$/);
  if (m) {
    const item = m[1]!.padStart(2, "0");
    const sub = m[2]!.padStart(2, "0");
  // Desdobro 01 — padrão nacional (Portal NFS-e) para itens com um único desdobro.
    if (item === "06" && sub === "01") return "060101";
    if (item === "04" && sub === "09") return "040901";
    return `${item}${sub}00`;
  }

  if (soDigitos.length === 4) {
    if (soDigitos === "0601") return "060101";
    if (soDigitos === "0409") return "040901";
    return `${soDigitos}00`;
  }

  if (soDigitos.length === 5) return `${soDigitos}0`;

  return null;
}

/** Belém/PA — LC 116 item 6.01 (pedicuros, podologia estética dos pés). */
export const CODIGO_SERVICO_PODOLOGIA = "060101";

/** CNAE padrão atual para Belém (informado pelo usuário): 8690-9/04-00. */
export const CNAE_PADRAO_BELEM = "869090400";
/** Alias legado para compatibilidade interna. */
export const CNAE_PODOLOGIA_BELEM = CNAE_PADRAO_BELEM;

export const DESCRICAO_LC116_PODOLOGIA =
  "Barbearia, cabeleireiros, manicuros, pedicuros e congêneres (LC 116 — 6.01)";

export function normalizarCnae(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 7) return `${d}00`;
  if (d.length === 9) return d;
  return null;
}
