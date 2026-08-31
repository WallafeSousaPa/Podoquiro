import {
  agruparItensParaEntrada,
  type ItemImportacaoRow,
} from "@/lib/estoque/dar-entrada-nfe";
import {
  qtdInteiraEstoque,
  vincularProdutoNfe,
  type ProdutoEstoqueMatch,
} from "@/lib/estoque/vincular-produtos-nfe";

export type ItemPreviewNfe = {
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
  v_prod: number;
  v_frete: number | null;
  acao_prevista: "atualizar" | "cadastrar";
  acao: "cadastrado" | "atualizado" | null;
  qtd_entrada: number | null;
  saldo_anterior: number | null;
  saldo_posterior: number | null;
  produto_existente: {
    id: string;
    produto: string;
    sku: string | null;
    barcode: string | null;
    qtd_estoque: number;
  } | null;
  estoque_apos: number;
};

export type ImportacaoPreview = {
  id: string;
  id_empresa: number;
  chave_acesso: string;
  numero_nf: number;
  serie: number;
  modelo: number;
  dh_emissao: string | null;
  natureza_operacao: string | null;
  status: "pendente" | "entrada_realizada";
  entrada_em: string | null;
  created_at: string;
  emitente: {
    cnpj: string | null;
    nome: string | null;
    fantasia: string | null;
    ie: string | null;
    uf: string | null;
    municipio: string | null;
    endereco: string | null;
    fone: string | null;
  };
  destinatario: {
    doc: string | null;
    tipo: string | null;
    nome: string | null;
    uf: string | null;
    municipio: string | null;
    endereco: string | null;
    email: string | null;
  };
  totais: {
    valor_produtos: number;
    valor_frete: number;
    valor_nf: number;
  };
  itens: ItemPreviewNfe[];
  resumo: {
    cadastrar: number;
    atualizar: number;
    unidades: number;
  };
};

type ImportacaoRow = {
  id: string;
  id_empresa: number;
  chave_acesso: string;
  numero_nf: number;
  serie: number;
  modelo: number;
  dh_emissao: string | null;
  natureza_operacao: string | null;
  status: "pendente" | "entrada_realizada";
  entrada_em: string | null;
  created_at: string;
  emit_cnpj: string | null;
  emit_nome: string | null;
  emit_fantasia: string | null;
  emit_ie: string | null;
  emit_uf: string | null;
  emit_municipio: string | null;
  emit_endereco: string | null;
  emit_fone: string | null;
  dest_doc: string | null;
  dest_tipo: string | null;
  dest_nome: string | null;
  dest_uf: string | null;
  dest_municipio: string | null;
  dest_endereco: string | null;
  dest_email: string | null;
  valor_produtos: number;
  valor_frete: number;
  valor_nf: number;
};

type ItemDb = ItemImportacaoRow & {
  v_prod: number;
  v_frete: number | null;
  acao: "cadastrado" | "atualizado" | null;
  qtd_entrada: number | null;
  saldo_anterior: number | null;
  saldo_posterior: number | null;
  id_produto: string | null;
};

export function montarPreviewImportacao(
  nota: ImportacaoRow,
  itens: ItemDb[],
  produtos: ProdutoEstoqueMatch[],
): ImportacaoPreview {
  const produtosById = new Map(produtos.map((p) => [p.id, p]));
  const grupos =
    nota.status === "pendente" ? agruparItensParaEntrada(itens, produtos) : [];
  const estoqueAposPorItem = new Map<string, number>();
  for (const g of grupos) {
    const depois = g.existente
      ? Math.round(Number(g.existente.qtd_estoque) + g.qtd)
      : g.qtd;
    for (const it of g.itens) {
      estoqueAposPorItem.set(it.id, depois);
    }
  }

  const previewItens: ItemPreviewNfe[] = itens
    .slice()
    .sort((a, b) => a.n_item - b.n_item)
    .map((item) => {
      const existente =
        nota.status === "entrada_realizada" && item.id_produto
          ? (produtosById.get(item.id_produto) ?? null)
          : vincularProdutoNfe({ cEan: item.c_ean, xProd: item.x_prod }, produtos);

      const qtd = qtdInteiraEstoque(Number(item.q_com));
      const estoqueAtual = existente ? Number(existente.qtd_estoque) : 0;
      const estoqueApos =
        nota.status === "entrada_realizada" && item.saldo_posterior != null
          ? item.saldo_posterior
          : (estoqueAposPorItem.get(item.id) ?? estoqueAtual + qtd);

      return {
        id: item.id,
        n_item: item.n_item,
        c_prod: item.c_prod,
        c_ean: item.c_ean,
        x_prod: item.x_prod,
        ncm: item.ncm,
        cest: item.cest,
        cfop: item.cfop,
        u_com: item.u_com,
        q_com: Number(item.q_com),
        v_un_com: Number(item.v_un_com),
        v_prod: Number(item.v_prod),
        v_frete: item.v_frete == null ? null : Number(item.v_frete),
        acao_prevista: existente ? "atualizar" : "cadastrar",
        acao: item.acao,
        qtd_entrada: item.qtd_entrada,
        saldo_anterior: item.saldo_anterior,
        saldo_posterior: item.saldo_posterior,
        produto_existente: existente
          ? {
              id: existente.id,
              produto: existente.produto,
              sku: existente.sku,
              barcode: existente.barcode,
              qtd_estoque: Number(existente.qtd_estoque),
            }
          : null,
        estoque_apos: estoqueApos,
      };
    });

  let cadastrar = 0;
  let atualizar = 0;
  if (nota.status === "entrada_realizada") {
    const vistos = new Set<string>();
    for (const it of previewItens) {
      const chave = it.produto_existente?.id ?? it.id;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      if (it.acao === "cadastrado") cadastrar += 1;
      else if (it.acao === "atualizado") atualizar += 1;
    }
  } else {
    for (const g of grupos) {
      if (g.existente) atualizar += 1;
      else cadastrar += 1;
    }
  }

  return {
    id: nota.id,
    id_empresa: Number(nota.id_empresa),
    chave_acesso: nota.chave_acesso,
    numero_nf: nota.numero_nf,
    serie: nota.serie,
    modelo: nota.modelo,
    dh_emissao: nota.dh_emissao,
    natureza_operacao: nota.natureza_operacao,
    status: nota.status,
    entrada_em: nota.entrada_em,
    created_at: nota.created_at,
    emitente: {
      cnpj: nota.emit_cnpj,
      nome: nota.emit_nome,
      fantasia: nota.emit_fantasia,
      ie: nota.emit_ie,
      uf: nota.emit_uf,
      municipio: nota.emit_municipio,
      endereco: nota.emit_endereco,
      fone: nota.emit_fone,
    },
    destinatario: {
      doc: nota.dest_doc,
      tipo: nota.dest_tipo,
      nome: nota.dest_nome,
      uf: nota.dest_uf,
      municipio: nota.dest_municipio,
      endereco: nota.dest_endereco,
      email: nota.dest_email,
    },
    totais: {
      valor_produtos: Number(nota.valor_produtos),
      valor_frete: Number(nota.valor_frete),
      valor_nf: Number(nota.valor_nf),
    },
    itens: previewItens,
    resumo: {
      cadastrar,
      atualizar,
      unidades: previewItens.reduce((s, i) => s + qtdInteiraEstoque(i.q_com), 0),
    },
  };
}
