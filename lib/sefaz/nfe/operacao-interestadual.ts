/** Operação nacional: interna (`idDest=1`) ou interestadual (`idDest=2`). */

const UFS_BR = new Set([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
]);

/** Origem Sul/Sudeste (exceto ES) para alíquota interestadual de 7%. */
const UF_SUL_SUDESTE = new Set(["SP", "RJ", "MG", "PR", "SC", "RS"]);

/** Destino Norte/Nordeste/Centro-Oeste/ES (alíquota 7% a partir do Sul/SE). */
const UF_DESTINO_7 = new Set([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MS", "MT",
  "PA", "PB", "PE", "PI", "RN", "RO", "RR", "SE", "TO",
]);

/** Alíquota interna modal de ICMS (para DIFAL / ICMSUFDest). */
const ALIQ_INTERNA: Record<string, number> = {
  AC: 19, AL: 19, AM: 20, AP: 18, BA: 20.5, CE: 20, DF: 20, ES: 17, GO: 19,
  MA: 23, MG: 18, MS: 17, MT: 17, PA: 19, PB: 20, PE: 20.5, PI: 22.5, PR: 19.5,
  RJ: 22, RN: 20, RO: 19.5, RR: 20, RS: 17, SC: 17, SE: 19, SP: 18, TO: 20,
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function ufBrasileira(uf: string | null | undefined): boolean {
  return UFS_BR.has((uf ?? "").trim().toUpperCase());
}

export function idDestNacional(ufEmitente: string, ufDest: string): 1 | 2 {
  return ufEmitente.trim().toUpperCase() === ufDest.trim().toUpperCase() ? 1 : 2;
}

/** 5xxx ↔ 6xxx conforme interna / interestadual. */
export function cfopParaIdDest(cfop: string, idDest: 1 | 2): string {
  const c = cfop.replace(/\D/g, "").padStart(4, "0").slice(0, 4);
  const head = c[0];
  if (idDest === 2 && head === "5") return `6${c.slice(1)}`;
  if (idDest === 1 && head === "6") return `5${c.slice(1)}`;
  return c;
}

export function pIcmsInter(ufEmitente: string, ufDest: string, orig: number): number {
  if (orig === 1 || orig === 2 || orig === 3 || orig === 8) return 4;
  const o = ufEmitente.trim().toUpperCase();
  const d = ufDest.trim().toUpperCase();
  if (UF_SUL_SUDESTE.has(o) && UF_DESTINO_7.has(d)) return 7;
  return 12;
}

export function pIcmsInternaUf(uf: string): number {
  return ALIQ_INTERNA[uf.trim().toUpperCase()] ?? 18;
}

export type IcmsUfDestCalc = {
  vBCUFDest: number;
  vBCFCPUFDest: number;
  pFCPUFDest: number;
  pICMSUFDest: number;
  pICMSInter: number;
  pICMSInterPart: number;
  vFCPUFDest: number;
  vICMSUFDest: number;
  vICMSUFRemet: number;
};

/** DIFAL (consumidor final não contribuinte, operação interestadual). Partilha 100% destino. */
export function calcularIcmsUfDest(opts: {
  vBc: number;
  ufEmitente: string;
  ufDest: string;
  orig: number;
}): IcmsUfDestCalc {
  const vBc = roundMoney(opts.vBc);
  const pDest = pIcmsInternaUf(opts.ufDest);
  const pInter = pIcmsInter(opts.ufEmitente, opts.ufDest, opts.orig);
  const vDest = roundMoney((vBc * Math.max(0, pDest - pInter)) / 100);
  return {
    vBCUFDest: vBc,
    vBCFCPUFDest: vBc,
    pFCPUFDest: 0,
    pICMSUFDest: pDest,
    pICMSInter: pInter,
    pICMSInterPart: 100,
    vFCPUFDest: 0,
    vICMSUFDest: vDest,
    vICMSUFRemet: 0,
  };
}
