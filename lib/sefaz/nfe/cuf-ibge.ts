import type { SiglaUf } from "./types";

/** Código IBGE da UF (campo cUF em consStatServ / NF-e). */
const POR_SIGLA: Partial<Record<SiglaUf, number>> = {
  PA: 15,
};

export function codigoUfParaNfe(sigla: SiglaUf): number {
  const c = POR_SIGLA[sigla];
  if (typeof c === "number") return c;
  throw new Error(`UF não mapeada para cUF: ${sigla}`);
}
