import type { SupabaseClient } from "@supabase/supabase-js";

export type RowAgProdInsert = {
  id_agendamento: number;
  id_produto: string;
  qtd: number;
  valor_desconto: number;
  valor_produto: number;
  valor_final: number;
};

/**
 * Monta linhas para `agendamento_produtos` a partir do body do PATCH (mercadorias).
 * `forcarValorDescontoZero`: perfil Recepção não envia desconto em R$ por linha.
 */
export async function montarLinhasProdutosAgendamentoDoBody(
  supabase: SupabaseClient,
  empresaId: number,
  idAgendamento: number,
  rawProdutos: unknown,
  opts: { forcarValorDescontoZero: boolean },
): Promise<
  | { ok: true; produtosInsert: RowAgProdInsert[]; somaProd: number }
  | { ok: false; status: number; error: string }
> {
  if (!Array.isArray(rawProdutos)) {
    return { ok: false, status: 400, error: "produtos deve ser um array." };
  }

  const produtosInsert: RowAgProdInsert[] = [];

  for (const item of rawProdutos) {
    if (!item || typeof item !== "object") {
      return { ok: false, status: 400, error: "Item de produto inválido." };
    }
    const o = item as { id_produto?: unknown; qtd?: unknown; valor_desconto?: unknown };
    const idProd =
      typeof o.id_produto === "string"
        ? o.id_produto.trim()
        : String(o.id_produto ?? "").trim();
    if (!idProd) {
      return { ok: false, status: 400, error: "Cada produto deve ter `id_produto`." };
    }
    const qtd = Number(o.qtd);
    let vd =
      o.valor_desconto === undefined || o.valor_desconto === null
        ? 0
        : Number(o.valor_desconto);
    if (opts.forcarValorDescontoZero) {
      vd = 0;
    }
    if (!Number.isFinite(qtd) || qtd <= 0) {
      return { ok: false, status: 400, error: "Quantidade do produto inválida." };
    }
    if (!Number.isFinite(vd) || vd < 0) {
      return { ok: false, status: 400, error: "Desconto do produto inválido." };
    }
    produtosInsert.push({
      id_agendamento: idAgendamento,
      id_produto: idProd,
      qtd,
      valor_desconto: Math.round(vd * 100) / 100,
      valor_produto: 0,
      valor_final: 0,
    });
  }

  if (produtosInsert.length > 0) {
    const pids = [...new Set(produtosInsert.map((r) => r.id_produto))];
    const { data: prodRows, error: prodErr } = await supabase
      .from("produtos")
      .select("id, id_empresa, servico, preco")
      .in("id", pids);
    if (prodErr) {
      return { ok: false, status: 500, error: prodErr.message };
    }
    const prodMap = new Map(
      (prodRows ?? []).map((r) => [
        String(r.id),
        {
          id_empresa: r.id_empresa as number,
          servico: Boolean(r.servico),
          preco: Number(r.preco),
        },
      ]),
    );
    for (const row of produtosInsert) {
      const meta = prodMap.get(row.id_produto);
      if (!meta || meta.id_empresa !== empresaId) {
        return {
          ok: false,
          status: 400,
          error: "Produto inválido ou de outra empresa.",
        };
      }
      if (meta.servico) {
        return {
          ok: false,
          status: 400,
          error: "Use apenas mercadorias (produtos não marcados como serviço).",
        };
      }
      if (!Number.isFinite(meta.preco) || meta.preco < 0) {
        return {
          ok: false,
          status: 400,
          error: "Preço do produto inválido no cadastro.",
        };
      }
      const vUnit = Math.round(meta.preco * 100) / 100;
      const brutoLinha = Math.round(row.qtd * vUnit * 100) / 100;
      if (row.valor_desconto > brutoLinha + 0.001) {
        return {
          ok: false,
          status: 400,
          error: "Desconto do produto não pode ser maior que o subtotal (qtd × preço).",
        };
      }
      row.valor_produto = vUnit;
      row.valor_final = Math.round((brutoLinha - row.valor_desconto) * 100) / 100;
    }
  }

  const somaProd =
    Math.round(produtosInsert.reduce((s, r) => s + r.valor_final, 0) * 100) / 100;

  return { ok: true, produtosInsert, somaProd };
}
