import type { PagamentoDetNfce } from "@/lib/sefaz/nfe/montar-nfce-produto";
import { tPagDeFormaPagamento } from "@/lib/financeiro/nfce-atendimento";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** CNPJ de credenciadoras comuns (maquineta/adquirente). */
const CNPJ_CREDENCIADORA_POR_NOME: Record<string, string> = {
  stone: "16501109000100",
  ton: "16501109000100",
  cielo: "01638447000120",
  rede: "02122582000160",
  getnet: "10440422000154",
  pagseguro: "08561701000101",
  "mercado pago": "10573521000191",
  safrapay: "58074124000120",
};

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

function normalizarTpag(tPag: string): string {
  return tPag.replace(/\D/g, "").padStart(2, "0").slice(0, 2);
}

export function isTpagCartao(tPag: string): boolean {
  const t = normalizarTpag(tPag);
  return t === "03" || t === "04";
}

/** PIX dinâmico (QR único por transação) — tPag 17. */
export function isTpagPixDinamico(tPag: string): boolean {
  return normalizarTpag(tPag) === "17";
}

/**
 * NT 2025.001: cartão (03/04) e PIX dinâmico (17) exigem grupo `card` na NFC-e.
 * PIX estático (20) não exige.
 */
export function isTpagExigeGrupoCardNfce(tPag: string): boolean {
  const t = normalizarTpag(tPag);
  return t === "03" || t === "04" || t === "17";
}

/** CNPJ da credenciadora (14 dígitos) para o grupo `card` da NFC-e. */
export function cnpjCredenciadoraCartao(
  maquineta: string | null | undefined,
  maquinetaCnpj?: string | null,
): string {
  const cnpjDb = (maquinetaCnpj ?? "").replace(/\D/g, "");
  if (cnpjDb.length === 14) return cnpjDb;

  const env = process.env.NFE_CREDENCIADORA_CNPJ?.replace(/\D/g, "") ?? "";
  if (env.length === 14) return env;

  const n = (maquineta ?? "").toLowerCase();
  for (const [chave, cnpj] of Object.entries(CNPJ_CREDENCIADORA_POR_NOME)) {
    if (n.includes(chave)) return cnpj;
  }
  return "";
}

function grupoCardNfce(
  tPag: string,
  maquineta: string | null | undefined,
  maquinetaCnpj?: string | null,
  bandeiraCodigo?: string | null,
): PagamentoDetNfce["card"] {
  const cnpj14 = cnpjCredenciadoraCartao(maquineta, maquinetaCnpj);
  if (!cnpj14) {
    if (isTpagPixDinamico(tPag)) {
      throw new Error(
        "PIX na NFC-e (código 17) exige o grupo de pagamento integrado (NT 2025.001). " +
          "Cadastre o CNPJ da instituição na maquineta (Financeiro → Parametrização → Maquinetas) " +
          "ou defina NFE_CREDENCIADORA_CNPJ no servidor.",
      );
    }
    throw new Error(
      "Pagamento com cartão exige CNPJ da credenciadora na NFC-e. " +
        "Cadastre o CNPJ na maquineta (Financeiro → Parametrização → Maquinetas) " +
        "ou defina NFE_CREDENCIADORA_CNPJ no servidor.",
    );
  }

  const base: PagamentoDetNfce["card"] = {
    tpIntegra: "2",
    cnpj14,
    cAut: "0",
  };

  if (isTpagPixDinamico(tPag)) {
    return base;
  }

  const tBandRaw = (bandeiraCodigo ?? "").replace(/\D/g, "");
  const tBand =
    tBandRaw.length > 0
      ? tBandRaw.padStart(2, "0").slice(0, 2)
      : tBandDeMaquineta(maquineta);
  return { ...base, tBand };
}

function linhaPagamentoNfce(
  tPag: string,
  vPag: number,
  maquineta: string | null | undefined,
  maquinetaCnpj?: string | null,
  bandeiraCodigo?: string | null,
): PagamentoDetNfce {
  const tPagNorm = normalizarTpag(tPag);
  const linha: PagamentoDetNfce = { tPag: tPagNorm, vPag: roundMoney(vPag) };
  if (isTpagExigeGrupoCardNfce(tPagNorm)) {
    linha.card = grupoCardNfce(tPagNorm, maquineta, maquinetaCnpj, bandeiraCodigo);
  }
  return linha;
}

export type PagamentoAtendimentoNfce = {
  forma: string | null;
  valor_pago: number;
  status_pagamento: string;
  maquineta: string | null;
  maquineta_cnpj: string | null;
  bandeira_codigo: string | null;
  bandeira_nome: string | null;
  agrupamento_caixa: string | null;
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
    maquineta_cnpj?: string | null;
    bandeira_codigo?: string | null;
    agrupamento_caixa?: string | null;
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
      linhaPagamentoNfce(
        tPagDeFormaPagamento(p.forma, p.agrupamento_caixa),
        total,
        p.maquineta ?? null,
        p.maquineta_cnpj ?? null,
        p.bandeira_codigo ?? null,
      ),
    ];
  }

  const linhas: PagamentoDetNfce[] = [];
  let restante = total;
  for (let i = 0; i < quitados.length; i++) {
    const p = quitados[i];
    const tPag = tPagDeFormaPagamento(p.forma, p.agrupamento_caixa);
    let vPag: number;
    if (i === quitados.length - 1) {
      vPag = roundMoney(restante);
    } else {
      vPag = roundMoney(total * (Number(p.valor_pago) / totalPago));
      restante = roundMoney(restante - vPag);
    }
    if (vPag > 0) {
      linhas.push(
        linhaPagamentoNfce(
          tPag,
          vPag,
          p.maquineta ?? null,
          p.maquineta_cnpj ?? null,
          p.bandeira_codigo ?? null,
        ),
      );
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
export function pagamentoUnicoNfce(
  tPag: string,
  vPag: number,
  maquineta?: string | null,
  maquinetaCnpj?: string | null,
): PagamentoDetNfce {
  return linhaPagamentoNfce(tPag, vPag, maquineta ?? null, maquinetaCnpj ?? null);
}
