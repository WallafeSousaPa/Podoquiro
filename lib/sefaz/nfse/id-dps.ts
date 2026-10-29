/** Tipo de inscrição do prestador no Id da DPS: 1=CPF, 2=CNPJ. */
export const TIPO_INSCRICAO_CNPJ_DPS = "2";

/**
 * Id do `infDPS`: DPS + cLocEmi(7) + tipoInscr(1) + CNPJ(14) + serie(5) + nDPS(15).
 */
export function montarIdInfDps(params: {
  cLocEmi: string;
  cnpj: string;
  serie: number | string;
  nDps: number | string;
}): string {
  const cLoc = String(params.cLocEmi).replace(/\D/g, "").padStart(7, "0").slice(-7);
  const cnpj = String(params.cnpj).replace(/\D/g, "").padStart(14, "0").slice(-14);
  const serie5 = String(params.serie).replace(/\D/g, "").padStart(5, "0").slice(-5);
  const n15 = String(params.nDps).replace(/\D/g, "").padStart(15, "0").slice(-15);
  return `DPS${cLoc}${TIPO_INSCRICAO_CNPJ_DPS}${cnpj}${serie5}${n15}`;
}

export function ehRefNfseAdn(ref: string | null | undefined): boolean {
  return String(ref ?? "").startsWith("adn-");
}

export function gerarRefNfseAdn(idAgendamento: number): string {
  return `adn-${idAgendamento}-${Date.now()}`;
}

/** PDF da NFS-e municipal: proxy autenticado no próprio sistema. */
export function urlDanfseAdnLocal(idEmissao: string): string {
  return `/api/nfse/adn/danfse?id=${encodeURIComponent(idEmissao)}`;
}
