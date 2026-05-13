import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUsuarioPodeRelatorioCaixa } from "@/lib/dashboard/menu-grupo";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_INTERVALO_DIAS = 366;

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  if (!DATA_RE.test(s)) return null;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m, d };
}

function diasEntre(inicio: string, fim: string): number {
  const a = parseYmd(inicio);
  const b = parseYmd(fim);
  if (!a || !b) return NaN;
  const ta = Date.UTC(a.y, a.m - 1, a.d);
  const tb = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((tb - ta) / 86400000);
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const pode = await getUsuarioPodeRelatorioCaixa(supabase, sessionUserId);
  if (!pode) {
    return NextResponse.json(
      { error: "Sem permissão para consultar o relatório de caixa." },
      { status: 403 },
    );
  }

  const sp = new URL(request.url).searchParams;
  const dataInicio = sp.get("data_inicio")?.trim() ?? "";
  const dataFim = sp.get("data_fim")?.trim() ?? "";

  if (!DATA_RE.test(dataInicio) || !DATA_RE.test(dataFim)) {
    return NextResponse.json(
      { error: "Informe data_inicio e data_fim (YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  if (dataInicio > dataFim) {
    return NextResponse.json(
      { error: "data_inicio não pode ser maior que data_fim." },
      { status: 400 },
    );
  }

  const span = diasEntre(dataInicio, dataFim);
  if (Number.isNaN(span) || span > MAX_INTERVALO_DIAS) {
    return NextResponse.json(
      { error: `O intervalo máximo é de ${MAX_INTERVALO_DIAS} dias.` },
      { status: 400 },
    );
  }

  const { data: lancs, error: lErr } = await supabase
    .from("caixa_lancamentos")
    .select("id, tipo, numero_caixa, data_lancamento, data_referencia, id_responsavel")
    .eq("id_empresa", empresaId)
    .gte("data_referencia", dataInicio)
    .lte("data_referencia", dataFim)
    .in("tipo", ["abertura", "fechamento"])
    .order("data_referencia", { ascending: false })
    .order("data_lancamento", { ascending: false });

  if (lErr) {
    console.error(lErr);
    return NextResponse.json({ error: lErr.message }, { status: 500 });
  }

  const rows = lancs ?? [];
  const idsResp = [...new Set(rows.map((r) => r.id_responsavel as number))];
  let nomesPorId: Record<number, string> = {};
  if (idsResp.length > 0) {
    const { data: us, error: uErr } = await supabase
      .from("usuarios")
      .select("id, nome_completo, usuario")
      .in("id", idsResp);
    if (!uErr && us) {
      nomesPorId = Object.fromEntries(
        us.map((u) => {
          const nome =
            (u.nome_completo != null && String(u.nome_completo).trim()) ||
            String(u.usuario);
          return [u.id as number, nome];
        }),
      );
    }
  }

  const idsFechamento = rows
    .filter((r) => r.tipo === "fechamento")
    .map((r) => r.id as number);
  let relPorFechamento: Record<
    number,
    {
      valor_dinheiro: number;
      valor_cartao_credito: number;
      valor_cartao_debito: number;
      valor_pix: number;
      criado_em: string;
    }
  > = {};
  if (idsFechamento.length > 0) {
    const { data: rels, error: rErr } = await supabase
      .from("caixa_relatorios")
      .select(
        "id_lancamento_fechamento, valor_dinheiro, valor_cartao_credito, valor_cartao_debito, valor_pix, criado_em",
      )
      .in("id_lancamento_fechamento", idsFechamento);
    if (!rErr && rels) {
      relPorFechamento = Object.fromEntries(
        rels.map((rel) => {
          const idF = rel.id_lancamento_fechamento as number;
          return [
            idF,
            {
              valor_dinheiro: Number(rel.valor_dinheiro),
              valor_cartao_credito: Number(rel.valor_cartao_credito),
              valor_cartao_debito: Number(rel.valor_cartao_debito),
              valor_pix: Number(rel.valor_pix),
              criado_em: rel.criado_em as string,
            },
          ];
        }),
      );
    }
  }

  const lancamentos = rows.map((r) => {
    const id = r.id as number;
    const tipo = r.tipo as string;
    const idResp = r.id_responsavel as number;
    const rel = tipo === "fechamento" ? relPorFechamento[id] ?? null : null;
    return {
      id,
      tipo,
      numero_caixa: String(r.numero_caixa ?? "").trim() || "—",
      data_referencia: r.data_referencia as string,
      data_lancamento: r.data_lancamento as string,
      id_responsavel: idResp,
      responsavel_nome: nomesPorId[idResp] ?? "—",
      relatorio: rel,
    };
  });

  return NextResponse.json({
    data_inicio: dataInicio,
    data_fim: dataFim,
    lancamentos,
  });
}
