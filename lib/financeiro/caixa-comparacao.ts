/** Compara valores monetários com arredondamento em centavos. */
export function valoresCaixaBatem(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export type EsperadoCaixa = {
  dinheiro: number;
  pix: number;
  cartao_credito: number;
  cartao_debito: number;
  outros: number;
};

export type InformadoCaixa = {
  dinheiro: number;
  pix: number;
  cartao_credito: number;
  cartao_debito: number;
};

export type LinhaDivergencia = {
  rotulo: string;
  chave: keyof InformadoCaixa;
  sistema: number;
  informado: number;
  diferenca: number;
};

/** Lista divergências campo a campo (apenas os quatro meios do fechamento). */
export function compararComSistema(
  esperado: EsperadoCaixa,
  informado: InformadoCaixa,
): LinhaDivergencia[] {
  const pares: { chave: keyof InformadoCaixa; rotulo: string }[] = [
    { chave: "dinheiro", rotulo: "Dinheiro" },
    { chave: "pix", rotulo: "Pix" },
    { chave: "cartao_credito", rotulo: "Cartão de crédito" },
    { chave: "cartao_debito", rotulo: "Cartão de débito" },
  ];
  const out: LinhaDivergencia[] = [];
  for (const { chave, rotulo } of pares) {
    const s = esperado[chave];
    const i = informado[chave];
    if (!valoresCaixaBatem(s, i)) {
      out.push({
        rotulo,
        chave,
        sistema: s,
        informado: i,
        diferenca: Math.round((i - s) * 100) / 100,
      });
    }
  }
  return out;
}
