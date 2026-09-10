import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseNumeroNaoNegativo,
  precoVendaPorPercentual,
  roundMoney,
} from "@/lib/estoque/preco-venda-produto";

export type TabelaPrecoRow = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
};

export type PrecoNaTabela = {
  id_tabela_preco: string;
  nome: string;
  ativo: boolean;
  preco_venda: number | null;
  percentual_sobre_custo: number | null;
};

export type PrecoTabelaInput = {
  id_tabela_preco: string;
  preco_venda?: unknown;
  percentual_sobre_custo?: unknown;
};

function isUuid(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

export function vendaEfetivaTabela(
  precoTabela: number | null | undefined,
  precoCadastro: number | null | undefined,
): number | null {
  const t = precoTabela != null ? Number(precoTabela) : NaN;
  if (Number.isFinite(t) && t > 0) return t;
  const c = precoCadastro != null ? Number(precoCadastro) : NaN;
  if (Number.isFinite(c) && c > 0) return c;
  return null;
}

export async function buscarIdTabelaPrecoEmpresa(
  supabase: SupabaseClient,
  idEmpresa: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("empresas")
    .select("tabela_preco_id")
    .eq("id", idEmpresa)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const id = (data as { tabela_preco_id?: string | null } | null)?.tabela_preco_id;
  return typeof id === "string" && id ? id : null;
}

export async function listarTabelasPreco(
  supabase: SupabaseClient,
  somenteAtivas = false,
): Promise<TabelaPrecoRow[]> {
  let q = supabase
    .from("tabelas_preco")
    .select("id, nome, descricao, ativo")
    .order("nome", { ascending: true });
  if (somenteAtivas) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as TabelaPrecoRow[];
}

export async function mapaPrecosDaTabela(
  supabase: SupabaseClient,
  idsProduto: string[],
  idTabela: string | null,
): Promise<Map<string, { preco_venda: number; percentual_sobre_custo: number | null }>> {
  const map = new Map<
    string,
    { preco_venda: number; percentual_sobre_custo: number | null }
  >();
  if (!idTabela || idsProduto.length === 0) return map;
  const { data, error } = await supabase
    .from("produto_tabela_preco")
    .select("id_produto, preco_venda, percentual_sobre_custo")
    .eq("id_tabela_preco", idTabela)
    .in("id_produto", idsProduto);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    map.set(row.id_produto as string, {
      preco_venda: Number(row.preco_venda),
      percentual_sobre_custo:
        row.percentual_sobre_custo != null ? Number(row.percentual_sobre_custo) : null,
    });
  }
  return map;
}

export async function precosPorTabelaDosProdutos(
  supabase: SupabaseClient,
  idsProduto: string[],
): Promise<Map<string, PrecoNaTabela[]>> {
  const out = new Map<string, PrecoNaTabela[]>();
  const tabelas = await listarTabelasPreco(supabase, false);
  if (idsProduto.length === 0) {
    for (const id of idsProduto) out.set(id, []);
    return out;
  }
  const { data, error } = await supabase
    .from("produto_tabela_preco")
    .select("id_produto, id_tabela_preco, preco_venda, percentual_sobre_custo")
    .in("id_produto", idsProduto);
  if (error) throw new Error(error.message);

  const byProd = new Map<string, Map<string, { preco_venda: number; percentual_sobre_custo: number | null }>>();
  for (const row of data ?? []) {
    const pid = row.id_produto as string;
    let inner = byProd.get(pid);
    if (!inner) {
      inner = new Map();
      byProd.set(pid, inner);
    }
    inner.set(row.id_tabela_preco as string, {
      preco_venda: Number(row.preco_venda),
      percentual_sobre_custo:
        row.percentual_sobre_custo != null ? Number(row.percentual_sobre_custo) : null,
    });
  }

  for (const pid of idsProduto) {
    const inner = byProd.get(pid);
    out.set(
      pid,
      tabelas.map((t) => {
        const p = inner?.get(t.id);
        return {
          id_tabela_preco: t.id,
          nome: t.nome,
          ativo: t.ativo,
          preco_venda: p?.preco_venda ?? null,
          percentual_sobre_custo: p?.percentual_sobre_custo ?? null,
        };
      }),
    );
  }
  return out;
}

export async function aplicarPrecoTabelaLoja<
  T extends {
    id: string;
    preco_venda?: number | null;
    percentual_sobre_custo?: number | null;
  },
>(
  supabase: SupabaseClient,
  produtos: T[],
  idEmpresa: number,
): Promise<
  (T & {
    preco_venda: number | null;
    percentual_sobre_custo: number | null;
    precos_por_tabela: PrecoNaTabela[];
  })[]
> {
  if (produtos.length === 0) return [];
  const ids = produtos.map((p) => p.id);
  try {
    const [idTabela, porTabela] = await Promise.all([
      buscarIdTabelaPrecoEmpresa(supabase, idEmpresa),
      precosPorTabelaDosProdutos(supabase, ids),
    ]);
    const daLoja = await mapaPrecosDaTabela(supabase, ids, idTabela);
    return produtos.map((p) => {
      const overlay = daLoja.get(p.id);
      const cadastro = p.preco_venda != null ? Number(p.preco_venda) : null;
      const cadPct =
        p.percentual_sobre_custo != null ? Number(p.percentual_sobre_custo) : null;
      return {
        ...p,
        preco_venda: overlay?.preco_venda ?? cadastro,
        percentual_sobre_custo: overlay?.percentual_sobre_custo ?? cadPct,
        precos_por_tabela: porTabela.get(p.id) ?? [],
      };
    });
  } catch (err) {
    console.error(err);
    return produtos.map((p) => ({
      ...p,
      preco_venda: p.preco_venda ?? null,
      percentual_sobre_custo: p.percentual_sobre_custo ?? null,
      precos_por_tabela: [],
    }));
  }
}

export async function precoVendaNaLoja(
  supabase: SupabaseClient,
  idProduto: string,
  idEmpresa: number,
  fallbackCadastro: number | null | undefined,
): Promise<number | null> {
  try {
    const idTabela = await buscarIdTabelaPrecoEmpresa(supabase, idEmpresa);
    if (idTabela) {
      const { data, error } = await supabase
        .from("produto_tabela_preco")
        .select("preco_venda")
        .eq("id_produto", idProduto)
        .eq("id_tabela_preco", idTabela)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const v = data?.preco_venda != null ? Number(data.preco_venda) : null;
      const efetivo = vendaEfetivaTabela(v, fallbackCadastro);
      if (efetivo != null) return efetivo;
    }
  } catch (err) {
    console.error(err);
  }
  return vendaEfetivaTabela(null, fallbackCadastro);
}

export async function sincronizarPrecoCadastroComTabelaLoja(
  supabase: SupabaseClient,
  idProduto: string,
  idEmpresa: number,
): Promise<void> {
  const idTabela = await buscarIdTabelaPrecoEmpresa(supabase, idEmpresa);
  if (!idTabela) return;
  const { data, error } = await supabase
    .from("produto_tabela_preco")
    .select("preco_venda, percentual_sobre_custo")
    .eq("id_produto", idProduto)
    .eq("id_tabela_preco", idTabela)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const { error: upErr } = await supabase
    .from("produtos")
    .update({
      preco_venda: data?.preco_venda != null ? Number(data.preco_venda) : null,
      percentual_sobre_custo:
        data?.percentual_sobre_custo != null ? Number(data.percentual_sobre_custo) : null,
    })
    .eq("id", idProduto);
  if (upErr) throw new Error(upErr.message);
}

async function upsertOuRemoverPreco(
  supabase: SupabaseClient,
  idProduto: string,
  idTabela: string,
  precoVenda: number | null,
  percentual: number | null,
): Promise<void> {
  if (precoVenda == null || precoVenda <= 0) {
    const { error } = await supabase
      .from("produto_tabela_preco")
      .delete()
      .eq("id_produto", idProduto)
      .eq("id_tabela_preco", idTabela);
    if (error) throw new Error(error.message);
    return;
  }
  const agora = new Date().toISOString();
  const { error } = await supabase.from("produto_tabela_preco").upsert(
    {
      id_produto: idProduto,
      id_tabela_preco: idTabela,
      preco_venda: roundMoney(precoVenda),
      percentual_sobre_custo: percentual,
      updated_at: agora,
    },
    { onConflict: "id_produto,id_tabela_preco" },
  );
  if (error) throw new Error(error.message);
}

export async function salvarPrecosTabelasDoProduto(
  supabase: SupabaseClient,
  params: {
    idProduto: string;
    idEmpresa: number;
    custo: number;
    itens: PrecoTabelaInput[];
  },
): Promise<void> {
  for (const item of params.itens) {
    if (!isUuid(item.id_tabela_preco)) {
      throw new Error("Tabela de preço inválida.");
    }
    let percentual: number | null = null;
    if (
      item.percentual_sobre_custo !== null &&
      typeof item.percentual_sobre_custo !== "undefined" &&
      item.percentual_sobre_custo !== ""
    ) {
      const pct = parseNumeroNaoNegativo(item.percentual_sobre_custo);
      if (pct === null) throw new Error("Percentual sobre o custo inválido.");
      percentual = pct;
    }
    let venda: number | null = null;
    if (percentual !== null) {
      venda = precoVendaPorPercentual(params.custo, percentual);
    } else if (
      item.preco_venda !== null &&
      typeof item.preco_venda !== "undefined" &&
      item.preco_venda !== ""
    ) {
      const pv = parseNumeroNaoNegativo(item.preco_venda);
      if (pv === null) throw new Error("Valor de venda inválido.");
      venda = pv;
    }
    await upsertOuRemoverPreco(
      supabase,
      params.idProduto,
      item.id_tabela_preco,
      venda,
      percentual,
    );
  }
  await sincronizarPrecoCadastroComTabelaLoja(supabase, params.idProduto, params.idEmpresa);
}

export async function aplicarPercentualNaTabelaDaLoja(
  supabase: SupabaseClient,
  params: {
    idProduto: string;
    idEmpresa: number;
    custo: number;
    percentual: number;
  },
): Promise<{ anterior: number | null; posterior: number }> {
  const idTabela = await buscarIdTabelaPrecoEmpresa(supabase, params.idEmpresa);
  const vendaNova = precoVendaPorPercentual(params.custo, params.percentual);
  let anterior: number | null = null;
  if (idTabela) {
    const { data } = await supabase
      .from("produto_tabela_preco")
      .select("preco_venda")
      .eq("id_produto", params.idProduto)
      .eq("id_tabela_preco", idTabela)
      .maybeSingle();
    anterior = data?.preco_venda != null ? Number(data.preco_venda) : null;
    await upsertOuRemoverPreco(
      supabase,
      params.idProduto,
      idTabela,
      vendaNova,
      params.percentual,
    );
  }
  const { error } = await supabase
    .from("produtos")
    .update({
      percentual_sobre_custo: params.percentual,
      preco_venda: vendaNova,
    })
    .eq("id", params.idProduto);
  if (error) throw new Error(error.message);
  return { anterior, posterior: vendaNova };
}

export async function recalcularPrecosPercentuaisDoProduto(
  supabase: SupabaseClient,
  idProduto: string,
  custo: number,
  idEmpresa: number,
): Promise<void> {
  const { data, error } = await supabase
    .from("produto_tabela_preco")
    .select("id_tabela_preco, percentual_sobre_custo")
    .eq("id_produto", idProduto)
    .not("percentual_sobre_custo", "is", null);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const pct = Number(row.percentual_sobre_custo);
    if (!Number.isFinite(pct)) continue;
    await upsertOuRemoverPreco(
      supabase,
      idProduto,
      row.id_tabela_preco as string,
      precoVendaPorPercentual(custo, pct),
      pct,
    );
  }
  await sincronizarPrecoCadastroComTabelaLoja(supabase, idProduto, idEmpresa);
}

export function parsePrecosTabelasBody(raw: unknown): PrecoTabelaInput[] | null {
  if (typeof raw === "undefined") return null;
  if (!Array.isArray(raw)) throw new Error("precos_tabelas deve ser uma lista.");
  return raw.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Item de tabela de preço inválido.");
    }
    const o = item as Record<string, unknown>;
    return {
      id_tabela_preco: String(o.id_tabela_preco ?? ""),
      preco_venda: o.preco_venda,
      percentual_sobre_custo: o.percentual_sobre_custo,
    };
  });
}
