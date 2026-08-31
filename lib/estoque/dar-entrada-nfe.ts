import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarMovimentacaoEstoque } from "@/lib/estoque/registrar-movimentacao-estoque";
import {
  chaveAgrupamentoNfe,
  qtdInteiraEstoque,
  vincularProdutoNfe,
  type ProdutoEstoqueMatch,
} from "@/lib/estoque/vincular-produtos-nfe";

export type ItemImportacaoRow = {
  id: string;
  n_item: number;
  c_prod: string | null;
  c_ean: string | null;
  x_prod: string;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  u_com: string | null;
  q_com: number;
  v_un_com: number;
  origem: number | null;
};

type GrupoEntrada = {
  chave: string;
  existente: ProdutoEstoqueMatch | null;
  itens: ItemImportacaoRow[];
  qtd: number;
  vUnCom: number;
  ncm: string;
  cest: string | null;
  uCom: string;
  origem: number;
  xProd: string;
};

function ncmValido(ncm: string | null | undefined): string {
  const d = (ncm ?? "").replace(/\D/g, "").slice(0, 8);
  return d.length === 8 ? d : "00000000";
}

function unMedida(u: string | null | undefined): string {
  const t = (u ?? "UN").trim().slice(0, 10);
  return t ? t.toUpperCase() : "UN";
}

export function agruparItensParaEntrada(
  itens: ItemImportacaoRow[],
  produtos: ProdutoEstoqueMatch[],
): GrupoEntrada[] {
  const map = new Map<string, GrupoEntrada>();

  for (const item of itens) {
    const existente = vincularProdutoNfe(
      { cEan: item.c_ean, xProd: item.x_prod },
      produtos,
    );
    const chave = existente
      ? `id:${existente.id}`
      : `novo:${chaveAgrupamentoNfe({ cEan: item.c_ean, xProd: item.x_prod })}`;

    const qtd = qtdInteiraEstoque(Number(item.q_com));
    const atual = map.get(chave);
    if (atual) {
      atual.itens.push(item);
      atual.qtd += qtd;
      if (Number(item.v_un_com) > atual.vUnCom) {
        atual.vUnCom = Number(item.v_un_com);
      }
      if (!atual.ncm && item.ncm) atual.ncm = ncmValido(item.ncm);
      if (!atual.cest && item.cest) atual.cest = item.cest;
      continue;
    }

    map.set(chave, {
      chave,
      existente,
      itens: [item],
      qtd,
      vUnCom: Number(item.v_un_com) || 0,
      ncm: ncmValido(item.ncm),
      cest: item.cest,
      uCom: unMedida(item.u_com),
      origem:
        typeof item.origem === "number" && item.origem >= 0 && item.origem <= 8
          ? item.origem
          : 0,
      xProd: item.x_prod.trim(),
    });
  }

  return [...map.values()].filter((g) => g.qtd > 0);
}

export type ResultadoEntradaNfe = {
  cadastrados: number;
  atualizados: number;
  unidades: number;
};

export async function darEntradaNfeImportacao(
  supabase: SupabaseClient,
  params: {
    id_empresa: number;
    id_importacao: string;
    numero_nf: number;
    chave_acesso: string;
    id_usuario: number | null;
    itens: ItemImportacaoRow[];
    produtos: ProdutoEstoqueMatch[];
  },
): Promise<ResultadoEntradaNfe> {
  const grupos = agruparItensParaEntrada(params.itens, params.produtos);
  const observacao = `NF-e ${params.numero_nf} — chave ${params.chave_acesso}`;

  let cadastrados = 0;
  let atualizados = 0;
  let unidades = 0;

  for (const grupo of grupos) {
    unidades += grupo.qtd;

    if (grupo.existente) {
      const { data: atual, error: e1 } = await supabase
        .from("produtos")
        .select("id, qtd_estoque, servico")
        .eq("id", grupo.existente.id)
        .eq("id_empresa", params.id_empresa)
        .maybeSingle();

      if (e1) throw new Error(e1.message);
      if (!atual || atual.servico) {
        throw new Error(`Produto "${grupo.xProd}" não encontrado para atualizar o estoque.`);
      }

      const saldoAnterior = Number(atual.qtd_estoque);
      const saldoPosterior = Math.round(saldoAnterior + grupo.qtd);

      const { error: e2 } = await supabase
        .from("produtos")
        .update({ qtd_estoque: saldoPosterior })
        .eq("id", grupo.existente.id)
        .eq("id_empresa", params.id_empresa);

      if (e2) throw new Error(e2.message);

      await registrarMovimentacaoEstoque(supabase, {
        id_empresa: params.id_empresa,
        id_produto: grupo.existente.id,
        tipo: "entrada",
        quantidade: grupo.qtd,
        saldo_anterior: saldoAnterior,
        saldo_posterior: saldoPosterior,
        origem: "importacao_nfe",
        id_usuario: params.id_usuario,
        observacao,
      });

      for (const item of grupo.itens) {
        const qtdItem = qtdInteiraEstoque(Number(item.q_com));
        const { error: e3 } = await supabase
          .from("estoque_nfe_importacao_itens")
          .update({
            id_produto: grupo.existente.id,
            acao: "atualizado",
            qtd_entrada: qtdItem,
            saldo_anterior: saldoAnterior,
            saldo_posterior: saldoPosterior,
          })
          .eq("id", item.id);
        if (e3) throw new Error(e3.message);
      }

      atualizados += 1;
      continue;
    }

    const preco = Number.isFinite(grupo.vUnCom) && grupo.vUnCom > 0 ? grupo.vUnCom : 0;
    const barcode = grupo.itens.map((i) => i.c_ean).find((e) => e && e.replace(/\D/g, "").length >= 8) ?? null;

    const { data: criado, error: insErr } = await supabase
      .from("produtos")
      .insert({
        id_empresa: params.id_empresa,
        produto: grupo.xProd.slice(0, 255),
        descricao: null,
        un_medida: grupo.uCom,
        preco,
        qtd_estoque: grupo.qtd,
        desconto_padrao: 0,
        preco_venda: null,
        ncm: grupo.ncm,
        cest: grupo.cest,
        origem: grupo.origem,
        csosn: "102",
        cfop: "5102",
        pis_cst: "07",
        cofins_cst: "07",
        ativo: true,
        servico: false,
        barcode,
      })
      .select("id")
      .single();

    if (insErr) {
      if (insErr.code === "23505") {
        throw new Error(
          `Não foi possível cadastrar "${grupo.xProd}": conflito de SKU. Tente novamente.`,
        );
      }
      throw new Error(insErr.message);
    }

    const idProduto = criado.id as string;

    await registrarMovimentacaoEstoque(supabase, {
      id_empresa: params.id_empresa,
      id_produto: idProduto,
      tipo: "entrada",
      quantidade: grupo.qtd,
      saldo_anterior: 0,
      saldo_posterior: grupo.qtd,
      origem: "importacao_nfe",
      id_usuario: params.id_usuario,
      observacao,
    });

    for (const item of grupo.itens) {
      const qtdItem = qtdInteiraEstoque(Number(item.q_com));
      const { error: e3 } = await supabase
        .from("estoque_nfe_importacao_itens")
        .update({
          id_produto: idProduto,
          acao: "cadastrado",
          qtd_entrada: qtdItem,
          saldo_anterior: 0,
          saldo_posterior: grupo.qtd,
        })
        .eq("id", item.id);
      if (e3) throw new Error(e3.message);
    }

    cadastrados += 1;
  }

  const { error: stErr } = await supabase
    .from("estoque_nfe_importacoes")
    .update({
      status: "entrada_realizada",
      entrada_em: new Date().toISOString(),
    })
    .eq("id", params.id_importacao)
    .eq("id_empresa", params.id_empresa)
    .eq("status", "pendente");

  if (stErr) throw new Error(stErr.message);

  return { cadastrados, atualizados, unidades };
}
