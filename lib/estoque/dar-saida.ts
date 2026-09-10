import type { SupabaseClient } from "@supabase/supabase-js";
import {
  montarPayloadNotaVenda,
  type EmpresaSnapshotNfe,
  type ItemPayloadNotaVenda,
} from "@/lib/estoque/montar-payload-nota-venda";
import { idsEmpresasParceirosVisiveis } from "@/lib/estoque/empresas-parceiros-compartilhados";
import type { ParceiroEstoqueRow } from "@/lib/estoque/parceiro-campos";
import {
  registrarMovimentacaoEstoque,
  type OrigemMovimentacaoEstoque,
} from "@/lib/estoque/registrar-movimentacao-estoque";
import type { TipoSaidaEstoque } from "@/lib/estoque/tipos-saida";
import { aplicarPrecoTabelaLoja } from "@/lib/estoque/tabelas-preco";
import { normalizarUfBr } from "@/lib/estoque/uf-br";

export type ItemSaidaInput = {
  id_produto: string;
  qtd: number;
  v_un: number;
  /** Desconto em reais do item (R$). */
  v_desc?: number;
};

type ProdutoSaida = {
  id: string;
  produto: string;
  sku: string | null;
  barcode: string | null;
  ncm: string | null;
  cfop: string | null;
  un_medida: string | null;
  qtd_estoque: number;
  servico: boolean;
  ativo: boolean;
  preco: number;
  preco_venda: number | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function descontoLinha(qtd: number, vUn: number, vDesc: number): number {
  const bruto = roundMoney(qtd * vUn);
  const desc = roundMoney(vDesc);
  if (!Number.isFinite(desc) || desc <= 0) return 0;
  return Math.min(desc, bruto);
}

function totalLinha(qtd: number, vUn: number, vDesc: number): number {
  return roundMoney(roundMoney(qtd * vUn) - descontoLinha(qtd, vUn, vDesc));
}

function origemDaSaida(tipo: TipoSaidaEstoque): OrigemMovimentacaoEstoque {
  if (tipo === "venda") return "saida_venda";
  if (tipo === "transferencia") return "saida_transferencia";
  if (tipo === "perda") return "saida_perda";
  return "saida_avulso";
}

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

export async function darSaidaEstoque(
  supabase: SupabaseClient,
  params: {
    id_empresa: number;
    tipo: TipoSaidaEstoque;
    id_comprador: string | null;
    id_empresa_destino: number | null;
    observacao: string | null;
    itens: ItemSaidaInput[];
    id_usuario: number | null;
  },
): Promise<{ id: string }> {
  if (params.itens.length === 0) {
    throw new Error("Inclua ao menos um produto na saída.");
  }

  const ids = [...new Set(params.itens.map((i) => i.id_produto))];
  const { data: produtos, error: prodErr } = await supabase
    .from("produtos")
    .select(
      "id, produto, sku, barcode, ncm, cfop, un_medida, qtd_estoque, servico, ativo, preco, preco_venda",
    )
    .eq("id_empresa", params.id_empresa)
    .in("id", ids);

  if (prodErr) throw new Error(prodErr.message);

  const produtosComTabela = await aplicarPrecoTabelaLoja(
    supabase,
    (produtos ?? []) as ProdutoSaida[],
    params.id_empresa,
  );
  const byId = new Map(produtosComTabela.map((p) => [p.id, p as ProdutoSaida]));
  for (const item of params.itens) {
    const p = byId.get(item.id_produto);
    if (!p) throw new Error("Há produto que não pertence a esta empresa.");
    if (p.servico) throw new Error(`"${p.produto}" é serviço e não sai do estoque.`);
    if (!p.ativo) throw new Error(`"${p.produto}" está inativo.`);
    if (!Number.isInteger(item.qtd) || item.qtd <= 0) {
      throw new Error("Quantidade deve ser um inteiro maior que zero.");
    }
    const vUnCatalogo =
      p.preco_venda != null && Number(p.preco_venda) > 0 ? Number(p.preco_venda) : 0;
    if (!Number.isFinite(vUnCatalogo) || vUnCatalogo <= 0) {
      throw new Error(
        `"${p.produto}" não tem valor de venda cadastrado. Cadastre em Estoque → Cadastro.`,
      );
    }
    const vDesc = item.v_desc ?? 0;
    if (!Number.isFinite(vDesc) || vDesc < 0) {
      throw new Error("Desconto inválido.");
    }
    if (roundMoney(vDesc) > roundMoney(item.qtd * vUnCatalogo)) {
      throw new Error(`Desconto de "${p.produto}" não pode ser maior que o total do item.`);
    }
  }

  const { data: empresa, error: empErr } = await supabase
    .from("empresas")
    .select(
      "id, razao_social, nome_fantasia, cnpj_cpf, cep, endereco, numero, complemento, bairro, cidade, estado",
    )
    .eq("id", params.id_empresa)
    .maybeSingle();
  if (empErr) throw new Error(empErr.message);
  if (!empresa) throw new Error("Empresa de origem não encontrada.");
  const emit = empresa as EmpresaSnapshotNfe;

  let comprador: ParceiroEstoqueRow | null = null;
  if (params.id_comprador) {
    const { data, error } = await supabase
      .from("estoque_compradores")
      .select("*")
      .eq("id", params.id_comprador)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Comprador não encontrado.");
    const idsEscopo = await idsEmpresasParceirosVisiveis(supabase, params.id_empresa);
    if (!idsEscopo.includes(Number((data as ParceiroEstoqueRow).id_empresa))) {
      throw new Error("Comprador não encontrado nesta empresa.");
    }
    comprador = data as ParceiroEstoqueRow;
  }

  if (params.tipo === "venda" && !comprador) {
    throw new Error("Selecione o comprador (destinatário) para a venda.");
  }

  let destEmpresaNome: string | null = null;
  if (params.tipo === "transferencia") {
    if (!params.id_empresa_destino) {
      throw new Error("Selecione a empresa de destino da transferência.");
    }
    if (params.id_empresa_destino === params.id_empresa) {
      throw new Error("A empresa de destino deve ser diferente da origem.");
    }
    const { data: destEmp, error: destErr } = await supabase
      .from("empresas")
      .select("id, nome_fantasia, razao_social")
      .eq("id", params.id_empresa_destino)
      .maybeSingle();
    if (destErr) throw new Error(destErr.message);
    if (!destEmp) throw new Error("Empresa de destino não encontrada.");
    destEmpresaNome =
      (destEmp.nome_fantasia as string | null)?.trim() ||
      (destEmp.razao_social as string | null)?.trim() ||
      `Empresa #${params.id_empresa_destino}`;
  }

  const linhas: {
    input: ItemSaidaInput;
    produto: ProdutoSaida;
    vDesc: number;
    vTotal: number;
  }[] = params.itens.map((input) => {
    const produto = byId.get(input.id_produto)!;
    const vUn =
      produto.preco_venda != null && Number(produto.preco_venda) > 0
        ? Number(produto.preco_venda)
        : 0;
    const vDesc = descontoLinha(input.qtd, vUn, input.v_desc ?? 0);
    return {
      input: { ...input, v_un: vUn },
      produto,
      vDesc,
      vTotal: totalLinha(input.qtd, vUn, vDesc),
    };
  });
  const valorTotal = roundMoney(linhas.reduce((s, l) => s + l.vTotal, 0));

  const destDoc = comprador ? soDigitos(comprador.doc) : null;
  const notaStatus = params.tipo === "venda" ? "pronta" : "nao_aplicavel";

  const { data: saida, error: insErr } = await supabase
    .from("estoque_saidas")
    .insert({
      id_empresa: params.id_empresa,
      tipo: params.tipo,
      status: "confirmada",
      data_saida: new Date().toISOString(),
      id_comprador: comprador?.id ?? null,
      id_empresa_destino: params.tipo === "transferencia" ? params.id_empresa_destino : null,
      observacao: params.observacao,
      emit_cnpj: soDigitos(emit.cnpj_cpf).slice(0, 14) || null,
      emit_nome: emit.razao_social,
      emit_fantasia: emit.nome_fantasia,
      emit_uf: normalizarUfBr(emit.estado),
      emit_municipio: emit.cidade,
      emit_endereco: emit.endereco,
      emit_numero: emit.numero,
      emit_complemento: emit.complemento,
      emit_bairro: emit.bairro,
      emit_cep: soDigitos(emit.cep).slice(0, 8) || null,
      dest_doc: destDoc || null,
      dest_tipo: comprador?.tipo_doc ?? null,
      dest_nome:
        comprador?.razao_social?.trim() ||
        comprador?.nome ||
        destEmpresaNome,
      dest_ie: comprador?.ie ?? null,
      dest_uf: normalizarUfBr(comprador?.uf),
      dest_municipio: comprador?.municipio ?? null,
      dest_endereco: comprador?.endereco ?? null,
      dest_numero: comprador?.numero ?? null,
      dest_complemento: comprador?.complemento ?? null,
      dest_bairro: comprador?.bairro ?? null,
      dest_cep: soDigitos(comprador?.cep).slice(0, 8) || null,
      dest_email: comprador?.email ?? null,
      dest_fone: comprador?.fone ?? null,
      valor_total: valorTotal,
      nota_venda_status: notaStatus,
      payload_nota_venda: null,
      id_usuario: params.id_usuario,
    })
    .select("id")
    .single();

  if (insErr || !saida) throw new Error(insErr?.message ?? "Não foi possível registrar a saída.");
  const idSaida = saida.id as string;

  const origem = origemDaSaida(params.tipo);
  const observacaoMov = [
    `Saída ${params.tipo}`,
    params.observacao?.trim(),
  ]
    .filter(Boolean)
    .join(" — ");

  const itensNota: ItemPayloadNotaVenda[] = [];
  let nItem = 0;

  for (const linha of linhas) {
    nItem += 1;
    const { data: atual, error: e1 } = await supabase
      .from("produtos")
      .select("id, qtd_estoque, servico")
      .eq("id", linha.produto.id)
      .eq("id_empresa", params.id_empresa)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!atual || atual.servico) {
      throw new Error(`Produto "${linha.produto.produto}" não encontrado para baixa.`);
    }

    const saldoAnterior = Number(atual.qtd_estoque);
    const saldoPosterior = Math.round(saldoAnterior - linha.input.qtd);

    const { error: e2 } = await supabase
      .from("produtos")
      .update({ qtd_estoque: saldoPosterior })
      .eq("id", linha.produto.id)
      .eq("id_empresa", params.id_empresa);
    if (e2) throw new Error(e2.message);

    await registrarMovimentacaoEstoque(supabase, {
      id_empresa: params.id_empresa,
      id_produto: linha.produto.id,
      tipo: "saida",
      quantidade: linha.input.qtd,
      saldo_anterior: saldoAnterior,
      saldo_posterior: saldoPosterior,
      origem,
      id_usuario: params.id_usuario,
      observacao: observacaoMov,
    });

    const { error: e3 } = await supabase.from("estoque_saida_itens").insert({
      id_saida: idSaida,
      n_item: nItem,
      id_produto: linha.produto.id,
      produto: linha.produto.produto,
      sku: linha.produto.sku,
      barcode: linha.produto.barcode,
      ncm: linha.produto.ncm,
      cfop: linha.produto.cfop,
      un_medida: linha.produto.un_medida || "UN",
      qtd: linha.input.qtd,
      v_un: linha.input.v_un,
      v_custo: roundMoney(Number(linha.produto.preco) || 0),
      v_desc: linha.vDesc,
      v_total: linha.vTotal,
      saldo_anterior: saldoAnterior,
      saldo_posterior: saldoPosterior,
    });
    if (e3) throw new Error(e3.message);

    itensNota.push({
      n_item: nItem,
      id_produto: linha.produto.id,
      produto: linha.produto.produto,
      sku: linha.produto.sku,
      barcode: linha.produto.barcode,
      ncm: linha.produto.ncm,
      cfop: linha.produto.cfop,
      un_medida: linha.produto.un_medida || "UN",
      quantidade: linha.input.qtd,
      v_un: linha.input.v_un,
      v_desc: linha.vDesc,
      v_total: linha.vTotal,
    });
  }

  if (params.tipo === "venda" && comprador) {
    const payload = montarPayloadNotaVenda({
      empresa: emit,
      comprador,
      itens: itensNota,
      valorTotal,
    });
    const { error: payErr } = await supabase
      .from("estoque_saidas")
      .update({ payload_nota_venda: payload, nota_venda_status: "pronta" })
      .eq("id", idSaida);
    if (payErr) throw new Error(payErr.message);
  }

  return { id: idSaida };
}
