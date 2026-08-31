import { normalizarNomeProduto } from "@/lib/estoque/parse-nfe-xml";

export type ProdutoEstoqueMatch = {
  id: string;
  produto: string;
  sku: string | null;
  barcode: string | null;
  qtd_estoque: number;
  ncm: string;
  servico: boolean;
};

export type ItemNfeParaMatch = {
  cEan: string | null;
  xProd: string;
};

export function chaveAgrupamentoNfe(item: ItemNfeParaMatch): string {
  const nome = normalizarNomeProduto(item.xProd);
  const ean = (item.cEan ?? "").replace(/\D/g, "");
  return `${ean || "sem-ean"}::${nome}`;
}

function barcodeDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Vincula o item da NF-e a um produto da empresa.
 * Ordem: EAN + nome normalizado → nome único (apenas mercadorias).
 */
export function vincularProdutoNfe(
  item: ItemNfeParaMatch,
  produtos: ProdutoEstoqueMatch[],
): ProdutoEstoqueMatch | null {
  const mercadorias = produtos.filter((p) => !p.servico);
  const ean = barcodeDigits(item.cEan);
  const nome = normalizarNomeProduto(item.xProd);

  if (ean) {
    const porEanNome = mercadorias.filter(
      (p) =>
        barcodeDigits(p.barcode) === ean && normalizarNomeProduto(p.produto) === nome,
    );
    if (porEanNome.length >= 1) return porEanNome[0] ?? null;
  }

  const porNome = mercadorias.filter((p) => normalizarNomeProduto(p.produto) === nome);
  if (porNome.length === 1) return porNome[0] ?? null;

  return null;
}

export function qtdInteiraEstoque(qCom: number): number {
  if (!Number.isFinite(qCom) || qCom <= 0) return 0;
  return Math.round(qCom);
}
