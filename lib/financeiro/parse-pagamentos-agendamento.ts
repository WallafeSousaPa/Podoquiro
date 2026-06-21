import type { SupabaseClient } from "@supabase/supabase-js";
import { formaPagamentoEhCartao } from "@/lib/financeiro/forma-pagamento-cartao";

const PG_STATUS = new Set(["pendente", "pago", "estornado"]);

export type PagamentoAgendamentoInput = {
  id_forma_pagamento: number;
  id_maquineta: number | null;
  id_bandeira: number | null;
  valor_pago: number;
  status_pagamento: string;
};

function isPgStatus(s: string): boolean {
  return PG_STATUS.has(s);
}

/**
 * Valida e normaliza o array `pagamentos` do body de agendamento.
 */
export async function parsePagamentosAgendamentoBody(
  supabase: SupabaseClient,
  arr: unknown,
): Promise<
  { ok: true; pagamentos: PagamentoAgendamentoInput[] } | { ok: false; error: string }
> {
  if (!Array.isArray(arr)) {
    return { ok: false, error: "pagamentos deve ser um array." };
  }

  const pagamentos: PagamentoAgendamentoInput[] = [];

  for (const pg of arr) {
    if (!pg || typeof pg !== "object") {
      return { ok: false, error: "Pagamento inválido." };
    }
    const o = pg as {
      id_forma_pagamento?: unknown;
      id_maquineta?: unknown;
      id_bandeira?: unknown;
      valor_pago?: unknown;
      status_pagamento?: unknown;
    };
    const ifp = Number(o.id_forma_pagamento);
    const vp = Number(o.valor_pago);
    const st = typeof o.status_pagamento === "string" ? o.status_pagamento : "pendente";
    let im: number | null = null;
    if (o.id_maquineta !== undefined && o.id_maquineta !== null && o.id_maquineta !== "") {
      const n = Number(o.id_maquineta);
      if (!Number.isFinite(n) || n <= 0) {
        return { ok: false, error: "Maquineta inválida." };
      }
      im = n;
    }
    let ib: number | null = null;
    if (o.id_bandeira !== undefined && o.id_bandeira !== null && o.id_bandeira !== "") {
      const n = Number(o.id_bandeira);
      if (!Number.isFinite(n) || n <= 0) {
        return { ok: false, error: "Bandeira inválida." };
      }
      ib = n;
    }
    if (!Number.isFinite(ifp) || ifp <= 0) {
      return { ok: false, error: "Forma de pagamento inválida." };
    }
    if (!Number.isFinite(vp) || vp < 0) {
      return { ok: false, error: "Valor pago inválido." };
    }
    if (!isPgStatus(st)) {
      return { ok: false, error: "Status de pagamento inválido." };
    }
    pagamentos.push({
      id_forma_pagamento: ifp,
      id_maquineta: im,
      id_bandeira: ib,
      valor_pago: Math.round(vp * 100) / 100,
      status_pagamento: st,
    });
  }

  if (pagamentos.length === 0) {
    return { ok: true, pagamentos };
  }

  const formas = [...new Set(pagamentos.map((p) => p.id_forma_pagamento))];
  const { data: fRows, error: fErr } = await supabase
    .from("formas_pagamento")
    .select("id, nome, agrupamento_caixa")
    .in("id", formas);
  if (fErr) {
    console.error(fErr);
    return { ok: false, error: fErr.message };
  }
  if ((fRows ?? []).length !== formas.length) {
    return { ok: false, error: "Forma de pagamento inválida." };
  }

  const formaMap = new Map(
    (fRows ?? []).map((f) => [
      f.id as number,
      {
        nome: String(f.nome ?? ""),
        agrupamento: f.agrupamento_caixa as string | null,
      },
    ]),
  );

  for (const p of pagamentos) {
    const forma = formaMap.get(p.id_forma_pagamento);
    if (!forma) continue;
    const ehCartao = formaPagamentoEhCartao(forma.agrupamento, forma.nome);
    if (ehCartao) {
      if (!p.id_maquineta) {
        return {
          ok: false,
          error: "Selecione a maquineta para pagamento com cartão.",
        };
      }
      if (!p.id_bandeira) {
        return {
          ok: false,
          error: "Selecione a bandeira do cartão para este pagamento.",
        };
      }
    } else if (p.id_bandeira) {
      return {
        ok: false,
        error: "Bandeira só pode ser informada em pagamentos com cartão.",
      };
    }
  }

  const maqs = pagamentos.map((p) => p.id_maquineta).filter((x): x is number => x !== null);
  if (maqs.length > 0) {
    const um = [...new Set(maqs)];
    const { data: mRows, error: mErr } = await supabase
      .from("maquinetas")
      .select("id, ativo")
      .in("id", um);
    if (mErr) {
      console.error(mErr);
      return { ok: false, error: mErr.message };
    }
    for (const mid of um) {
      const row = (mRows ?? []).find((r) => (r.id as number) === mid);
      if (!row || !row.ativo) {
        return { ok: false, error: "Maquineta inválida ou inativa." };
      }
    }
  }

  const bands = pagamentos.map((p) => p.id_bandeira).filter((x): x is number => x !== null);
  if (bands.length > 0) {
    const ub = [...new Set(bands)];
    const { data: bRows, error: bErr } = await supabase
      .from("bandeiras")
      .select("id, ativo")
      .in("id", ub);
    if (bErr) {
      console.error(bErr);
      return { ok: false, error: bErr.message };
    }
    for (const bid of ub) {
      const row = (bRows ?? []).find((r) => (r.id as number) === bid);
      if (!row || !row.ativo) {
        return { ok: false, error: "Bandeira inválida ou inativa." };
      }
    }
  }

  return { ok: true, pagamentos };
}
