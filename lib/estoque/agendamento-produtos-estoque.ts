import type { SupabaseClient } from "@supabase/supabase-js";

export function somarQtdPorProduto(
  rows: { id_produto: string; qtd: number | string }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const id = String(r.id_produto).trim();
    if (!id) continue;
    const q = Number(r.qtd);
    if (!Number.isFinite(q)) continue;
    m.set(id, (m.get(id) ?? 0) + q);
  }
  return m;
}

/**
 * Para cada produto: (novo − anterior). Positivo = mais unidades vendidas → baixa no estoque.
 */
export function deltaVendaEntreMapas(
  anterior: Map<string, number>,
  novo: Map<string, number>,
): Map<string, number> {
  const keys = new Set([...anterior.keys(), ...novo.keys()]);
  const out = new Map<string, number>();
  for (const k of keys) {
    const d = (novo.get(k) ?? 0) - (anterior.get(k) ?? 0);
    if (Math.abs(d) < 1e-9) continue;
    out.set(k, d);
  }
  return out;
}

type BaixaResult = { ok: true } | { ok: false; message: string };

/**
 * Aplica baixa (ou estorno) no estoque de mercadorias.
 * `deltaPositivoVenda` = unidades a retirar do estoque (positivo vende mais; negativo devolve ao estoque).
 * `qtd_estoque` no cadastro é inteiro; o saldo após a operação é arredondado.
 */
export async function baixarOuEstornarEstoqueMercadorias(
  supabase: SupabaseClient,
  empresaId: number,
  deltaPositivoVenda: Map<string, number>,
): Promise<BaixaResult> {
  for (const [idProd, deltaVendido] of deltaPositivoVenda) {
    if (Math.abs(deltaVendido) < 1e-9) continue;

    const { data: prow, error: e1 } = await supabase
      .from("produtos")
      .select("id, servico, qtd_estoque")
      .eq("id", idProd)
      .eq("id_empresa", empresaId)
      .maybeSingle();

    if (e1) {
      console.error(e1);
      return { ok: false, message: e1.message };
    }
    if (!prow || prow.servico) continue;

    const atual = Number(prow.qtd_estoque);
    const proximo = Math.round(atual - deltaVendido);

    const { error: e2 } = await supabase
      .from("produtos")
      .update({ qtd_estoque: proximo })
      .eq("id", idProd)
      .eq("id_empresa", empresaId);

    if (e2) {
      console.error(e2);
      return { ok: false, message: e2.message };
    }
  }
  return { ok: true };
}
