/** Montagem da chave de 44 dígitos (modelo 55) — algoritmo DV igual ao sped-common `Keys`. */

export function gerarCodigoNumericoNfe8(): string {
  return String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0");
}

/** DV do primeiro argumento (43 dígitos). */
export function calcularDvChaveNfe43(base43: string): string {
  if (base43.length !== 43 || !/^\d{43}$/.test(base43)) {
    throw new Error("Base da chave deve ter exatamente 43 dígitos.");
  }
  const multipliers = [2, 3, 4, 5, 6, 7, 8, 9];
  let weightedSum = 0;
  let iCount = 42;
  while (iCount >= 0) {
    for (let mCount = 0; mCount < 8 && iCount >= 0; mCount++) {
      const digit = base43.charCodeAt(iCount) - 48;
      weightedSum += digit * multipliers[mCount]!;
      iCount--;
    }
  }
  let vdigit = 11 - (weightedSum % 11);
  if (vdigit > 9) vdigit = 0;
  return String(vdigit);
}

/**
 * Chave 44 posições: cUF(2)+ano(2)+mês(2)+CNPJ(14)+mod(2)+série(3)+nNF(9)+tpEmis(1)+cNF(8)+DV(1).
 * `ano` e `mes` são os últimos 2 dígitos do ano e o mês (ex.: 2026/05 → 26, 05).
 */
export function montarChaveAcessoNfe55(opts: {
  cUF: number;
  ano: number;
  mes: number;
  cnpj14: string;
  mod: number;
  serie: number;
  numeroNf: number;
  tpEmis: number;
  codigoNumerico8: string;
}): string {
  const cnpj = opts.cnpj14.replace(/\D/g, "").padStart(14, "0");
  if (cnpj.length !== 14) throw new Error("CNPJ deve ter 14 dígitos para a chave.");
  const yy = opts.ano % 100;
  const mm = opts.mes;
  if (mm < 1 || mm > 12) throw new Error("Mês inválido.");
  const base43 = [
    String(opts.cUF).padStart(2, "0"),
    String(yy).padStart(2, "0"),
    String(mm).padStart(2, "0"),
    cnpj,
    String(opts.mod).padStart(2, "0"),
    String(opts.serie).padStart(3, "0"),
    String(opts.numeroNf).padStart(9, "0"),
    String(Math.min(9, Math.max(0, Math.floor(opts.tpEmis)))).slice(0, 1),
    opts.codigoNumerico8.replace(/\D/g, "").padStart(8, "0"),
  ].join("");
  if (base43.length !== 43) throw new Error(`Chave base inválida (${base43.length}).`);
  return base43 + calcularDvChaveNfe43(base43);
}
