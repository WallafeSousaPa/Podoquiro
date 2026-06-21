import type { PagamentoDetNfce } from "@/lib/sefaz/nfe/montar-nfce-produto";
import { tPagDeFormaPagamento } from "@/lib/financeiro/nfce-atendimento";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Bandeira do cartão (`tBand`) inferida pelo nome da maquineta. */
export function tBandDeMaquineta(nome: string | null | undefined): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("visa")) return "01";
  if (n.includes("master")) return "02";
  if (n.includes("amex") || n.includes("american")) return "03";
  if (n.includes("elo")) return "06";
  if (n.includes("hiper")) return "07";
  if (n.includes("diners")) return "05";
  return "99";
}

export function isTpagCartao(tPag: string): boolean {
  const t = tPag.replace(/\D/g, "").padStart(2, "0").slice(0, 2);
  return t === "03" || t === "04";
}

function linhaPagamentoNfce(
  tPag: string,
  vPag: number,
  maquineta: string | null | undefined,
): PagamentoDetNfce {
  const tPagNorm = tPag.replace(/\D/g, "").padStart(2, "0").slice(0, 2);
  const linha: PagamentoDetNfce = { tPag: tPagNorm, vPag: roundMoney(vPag) };
  if (isTpagCartao(tPagNorm)) {
    linha.card = {
      tpIntegra: "2",
      tBand: tBandDeMaquineta(maquineta),
    };
  }
  return linha;
}

export type PagamentoAtendimentoNfce = {
  forma: string | null;
  valor_pago: number;
  status_pagamento: string;
  maquineta: string | null;
  t_pag: string;
};

/**
 * Monta linhas `detPag` da NFC-e com base nos pagamentos quitados do atendimento,
 * limitando o total ao valor dos produtos da nota.
 */
export function distribuirPagamentosNfceAtendimento(
  pagamentos: Array<{
    forma: string | null;
    valor_pago: number;
    status_pagamento: string;
    maquineta?: string | null;
  }>,
  totalNfce: number,
): PagamentoDetNfce[] {
  const total = roundMoney(totalNfce);
  if (total <= 0) return [{ tPag: "01", vPag: 0 }];

  const quitados = pagamentos.filter((p) => p.status_pagamento === "pago");
  if (quitados.length === 0) {
    return [linhaPagamentoNfce("01", total, null)];
  }

  const totalPago = quitados.reduce((s, p) => s + Number(p.valor_pago), 0);
  if (totalPago <= 0) {
    return [linhaPagamentoNfce("01", total, null)];
  }

  if (quitados.length === 1) {
    const p = quitados[0];
    return [
      linhaPagamentoNfce(tPagDeFormaPagamento(p.forma), total, p.maquineta ?? null),
    ];
  }

  const linhas: PagamentoDetNfce[] = [];
  let restante = total;
  for (let i = 0; i < quitados.length; i++) {
    const p = quitados[i];
    const tPag = tPagDeFormaPagamento(p.forma);
    let vPag: number;
    if (i === quitados.length - 1) {
      vPag = roundMoney(restante);
    } else {
      vPag = roundMoney(total * (Number(p.valor_pago) / totalPago));
      restante = roundMoney(restante - vPag);
    }
    if (vPag > 0) {
      linhas.push(linhaPagamentoNfce(tPag, vPag, p.maquineta ?? null));
    }
  }

  if (linhas.length === 0) {
    return [linhaPagamentoNfce("01", total, null)];
  }

  const soma = roundMoney(linhas.reduce((s, l) => s + l.vPag, 0));
  if (soma !== total) {
    linhas[linhas.length - 1].vPag = roundMoney(
      linhas[linhas.length - 1].vPag + (total - soma),
    );
  }

  return linhas;
}

/** Uma linha de pagamento (emissão manual sem atendimento). */
export function pagamentoUnicoNfce(tPag: string, vPag: number): PagamentoDetNfce {
  return linhaPagamentoNfce(tPag, vPag, null);
}
