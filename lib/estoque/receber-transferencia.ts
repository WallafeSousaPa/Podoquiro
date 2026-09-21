import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarNomeProduto } from "@/lib/estoque/parse-nfe-xml";
import { registrarMovimentacaoEstoque } from "@/lib/estoque/registrar-movimentacao-estoque";

type ItemTransferencia = {
  id: string;
  id_produto: string | null;
  produto: string;
  sku: string | null;
  barcode: string | null;
  ncm: string | null;
  cfop: string | null;
  un_medida: string | null;
  qtd: number;
  v_un: number;
  v_custo?: number | null;
};

type ProdutoDestino = {
  id: string;
  produto: string;
  sku: string | null;
  barcode: string | null;
  servico: boolean;
};

type ProdutoOrigem = {
  id: string;
  produto: string;
  descricao: string | null;
  sku: string | null;
  barcode: string | null;
  un_medida: string;
  preco: number;
  ncm: string;
  cest: string | null;
  origem: number;
  csosn: string;
  cfop: string;
  pis_cst: string | null;
  cofins_cst: string | null;
  desconto_padrao: number;
  preco_venda: number | null;
  percentual_sobre_custo: number | null;
  servico: boolean;
};

function barcodeDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function ncmValido(ncm: string | null | undefined): string {
  const d = (ncm ?? "").replace(/\D/g, "").slice(0, 8);
  return d.length === 8 ? d : "00000000";
}

function unMedida(u: string | null | undefined): string {
  const t = (u ?? "UN").trim().slice(0, 10);
  return t ? t.toUpperCase() : "UN";
}

function encontrarProdutoDestino(
  item: ItemTransferencia,
  origem: ProdutoOrigem | undefined,
  destinos: ProdutoDestino[],
): ProdutoDestino | null {
  const mercadorias = destinos.filter((p) => !p.servico);
  const nome = normalizarNomeProduto(origem?.produto ?? item.produto);
  const ean = barcodeDigits(origem?.barcode ?? item.barcode);
  const sku = (origem?.sku ?? item.sku ?? "").trim();

  if (ean) {
    const porEanNome = mercadorias.filter(
      (p) =>
        barcodeDigits(p.barcode) === ean &&
        normalizarNomeProduto(p.produto) === nome,
    );
    if (porEanNome.length >= 1) return porEanNome[0] ?? null;
  }

  if (sku) {
    const porSku = mercadorias.filter((p) => (p.sku ?? "").trim() === sku);
    if (porSku.length === 1) return porSku[0] ?? null;
  }

  const porNome = mercadorias.filter(
    (p) => normalizarNomeProduto(p.produto) === nome,
  );
  if (porNome.length === 1) return porNome[0] ?? null;
  return null;
}

async function criarProdutoDestino(
  supabase: SupabaseClient,
  idEmpresaDestino: number,
  item: ItemTransferencia,
  origem: ProdutoOrigem | undefined,
  destinos: ProdutoDestino[],
): Promise<ProdutoDestino> {
  const skuOrigem = (origem?.sku ?? item.sku ?? "").trim() || null;
  const skuOcupado =
    skuOrigem != null &&
    destinos.some((p) => (p.sku ?? "").trim() === skuOrigem);

  const { data, error } = await supabase
    .from("produtos")
    .insert({
      id_empresa: idEmpresaDestino,
      produto: (origem?.produto ?? item.produto).trim(),
      descricao: origem?.descricao ?? null,
      sku: skuOcupado ? null : skuOrigem,
      barcode: origem?.barcode ?? item.barcode ?? null,
      un_medida: unMedida(origem?.un_medida ?? item.un_medida),
      preco: Number(origem?.preco ?? item.v_custo ?? 0) || 0,
      qtd_estoque: 0,
      desconto_padrao: origem?.desconto_padrao ?? 0,
      preco_venda:
        origem?.preco_venda != null
          ? Number(origem.preco_venda)
          : Number(item.v_un) > 0
            ? Number(item.v_un)
            : null,
      percentual_sobre_custo: origem?.percentual_sobre_custo ?? null,
      ncm: ncmValido(origem?.ncm ?? item.ncm),
      cest: origem?.cest ?? null,
      origem: origem?.origem ?? 0,
      csosn: origem?.csosn ?? "102",
      cfop: origem?.cfop ?? item.cfop ?? "5102",
      pis_cst: origem?.pis_cst ?? "07",
      cofins_cst: origem?.cofins_cst ?? "07",
      ativo: true,
      servico: false,
    })
    .select("id, produto, sku, barcode, servico")
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? `Não foi possível cadastrar "${item.produto}" na loja destino.`,
    );
  }

  const criado = data as ProdutoDestino;
  destinos.push(criado);
  return criado;
}

export async function receberTransferenciaEstoque(
  supabase: SupabaseClient,
  params: {
    id_saida: string;
    id_empresa_destino: number;
    id_usuario: number | null;
  },
): Promise<void> {
  const { data: saida, error: saidaErr } = await supabase
    .from("estoque_saidas")
    .select("id, tipo, status, id_empresa, id_empresa_destino, dest_nome, emit_fantasia, emit_nome")
    .eq("id", params.id_saida)
    .maybeSingle();
  if (saidaErr) throw new Error(saidaErr.message);
  if (!saida) throw new Error("Transferência não encontrada.");
  if (saida.tipo !== "transferencia") {
    throw new Error("Somente transferência pode ser recebida.");
  }
  if (saida.status === "cancelada") {
    throw new Error("Esta transferência está cancelada.");
  }
  if (saida.status === "confirmada") {
    throw new Error("Esta transferência já foi recebida.");
  }
  if (saida.status !== "em_transito") {
    throw new Error("Esta transferência não está em trânsito.");
  }
  if (Number(saida.id_empresa_destino) !== params.id_empresa_destino) {
    throw new Error("Selecione a loja destino para confirmar o recebimento.");
  }

  const { data: claimed, error: claimErr } = await supabase
    .from("estoque_saidas")
    .update({
      status: "confirmada",
      recebida_em: new Date().toISOString(),
      id_usuario_recebimento: params.id_usuario,
    })
    .eq("id", params.id_saida)
    .eq("status", "em_transito")
    .select("id")
    .maybeSingle();
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed) {
    throw new Error("Esta transferência já foi recebida.");
  }

  try {
    const { data: itens, error: itensErr } = await supabase
      .from("estoque_saida_itens")
      .select(
        "id, id_produto, produto, sku, barcode, ncm, cfop, un_medida, qtd, v_un, v_custo",
      )
      .eq("id_saida", params.id_saida)
      .order("n_item", { ascending: true });
    if (itensErr) throw new Error(itensErr.message);

    const linhas = (itens ?? []) as ItemTransferencia[];
    const idsOrigem = [
      ...new Set(linhas.map((i) => i.id_produto).filter((id): id is string => !!id)),
    ];

    const origemById = new Map<string, ProdutoOrigem>();
    if (idsOrigem.length > 0) {
      const { data: origens, error: origErr } = await supabase
        .from("produtos")
        .select(
          "id, produto, descricao, sku, barcode, un_medida, preco, ncm, cest, origem, csosn, cfop, pis_cst, cofins_cst, desconto_padrao, preco_venda, percentual_sobre_custo, servico",
        )
        .in("id", idsOrigem);
      if (origErr) throw new Error(origErr.message);
      for (const p of origens ?? []) {
        origemById.set(p.id as string, p as ProdutoOrigem);
      }
    }

    const { data: destRows, error: destErr } = await supabase
      .from("produtos")
      .select("id, produto, sku, barcode, servico")
      .eq("id_empresa", params.id_empresa_destino)
      .eq("servico", false);
    if (destErr) throw new Error(destErr.message);
    const destinos = (destRows ?? []) as ProdutoDestino[];

    const observacaoMov = `Entrada — transferência (${
      (saida.emit_fantasia as string | null)?.trim() ||
      (saida.emit_nome as string | null)?.trim() ||
      "loja origem"
    })`;

    for (const item of linhas) {
      const qtd = Math.round(Number(item.qtd));
      if (qtd <= 0) continue;

      const origem = item.id_produto ? origemById.get(item.id_produto) : undefined;
      let dest =
        encontrarProdutoDestino(item, origem, destinos) ??
        (await criarProdutoDestino(
          supabase,
          params.id_empresa_destino,
          item,
          origem,
          destinos,
        ));

      const { data: atual, error: e1 } = await supabase
        .from("produtos")
        .select("id, qtd_estoque, servico")
        .eq("id", dest.id)
        .eq("id_empresa", params.id_empresa_destino)
        .maybeSingle();
      if (e1) throw new Error(e1.message);
      if (!atual || atual.servico) {
        throw new Error(`Produto "${item.produto}" não encontrado na loja destino.`);
      }

      const saldoAnterior = Number(atual.qtd_estoque);
      const saldoPosterior = Math.round(saldoAnterior + qtd);

      const { error: e2 } = await supabase
        .from("produtos")
        .update({ qtd_estoque: saldoPosterior })
        .eq("id", dest.id)
        .eq("id_empresa", params.id_empresa_destino);
      if (e2) throw new Error(e2.message);

      await registrarMovimentacaoEstoque(supabase, {
        id_empresa: params.id_empresa_destino,
        id_produto: dest.id,
        tipo: "entrada",
        quantidade: qtd,
        saldo_anterior: saldoAnterior,
        saldo_posterior: saldoPosterior,
        origem: "entrada_transferencia",
        id_usuario: params.id_usuario,
        observacao: observacaoMov,
      });

      const { error: e3 } = await supabase
        .from("estoque_saida_itens")
        .update({ id_produto_destino: dest.id })
        .eq("id", item.id);
      if (e3) throw new Error(e3.message);
    }
  } catch (e) {
    await supabase
      .from("estoque_saidas")
      .update({
        status: "em_transito",
        recebida_em: null,
        id_usuario_recebimento: null,
      })
      .eq("id", params.id_saida)
      .eq("status", "confirmada");
    throw e;
  }
}
