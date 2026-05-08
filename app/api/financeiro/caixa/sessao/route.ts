import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const dataRef =
    new URL(request.url).searchParams.get("data")?.trim() ?? "";
  if (!DATA_RE.test(dataRef)) {
    return NextResponse.json(
      { error: "Parâmetro data inválido (use YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: lancs, error: lErr } = await supabase
    .from("caixa_lancamentos")
    .select("id, tipo, numero_caixa, data_lancamento, data_referencia, id_responsavel")
    .eq("id_empresa", empresaId)
    .eq("data_referencia", dataRef)
    .order("data_lancamento", { ascending: true });

  if (lErr) {
    console.error(lErr);
    return NextResponse.json({ error: lErr.message }, { status: 500 });
  }

  const rows = lancs ?? [];
  const aberturasPorNumero = new Map<string, (typeof rows)[number]>();
  const fechamentosPorNumero = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const numero = String(r.numero_caixa ?? "").trim();
    if (!numero) continue;
    if (r.tipo === "abertura") {
      aberturasPorNumero.set(numero, r);
    } else if (r.tipo === "fechamento") {
      fechamentosPorNumero.set(numero, r);
    }
  }

  const numerosAbertos = [...aberturasPorNumero.keys()].filter(
    (n) => !fechamentosPorNumero.has(n),
  );
  const numeroAbertoAtual =
    numerosAbertos.sort((a, b) => Number(b) - Number(a))[0] ?? null;
  const aberturaAtual = numeroAbertoAtual ? aberturasPorNumero.get(numeroAbertoAtual) ?? null : null;

  const fechamentos = [...fechamentosPorNumero.values()].sort((a, b) =>
    String(b.data_lancamento).localeCompare(String(a.data_lancamento)),
  );
  const fechamentoMaisRecente = fechamentos[0] ?? null;

  const idsResp = [
    ...new Set(rows.map((r) => r.id_responsavel as number)),
  ];
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

  let relatorio: {
    id: number;
    valor_dinheiro: number;
    valor_cartao_credito: number;
    valor_cartao_debito: number;
    valor_pix: number;
    criado_em: string;
  } | null = null;

  if (fechamentoMaisRecente) {
    const { data: rel, error: rErr } = await supabase
      .from("caixa_relatorios")
      .select(
        "id, valor_dinheiro, valor_cartao_credito, valor_cartao_debito, valor_pix, criado_em",
      )
      .eq("id_lancamento_fechamento", fechamentoMaisRecente.id as number)
      .maybeSingle();
    if (!rErr && rel) {
      relatorio = {
        id: rel.id as number,
        valor_dinheiro: Number(rel.valor_dinheiro),
        valor_cartao_credito: Number(rel.valor_cartao_credito),
        valor_cartao_debito: Number(rel.valor_cartao_debito),
        valor_pix: Number(rel.valor_pix),
        criado_em: rel.criado_em as string,
      };
    }
  }

  return NextResponse.json({
    data_referencia: dataRef,
    tem_abertura: Boolean(aberturaAtual),
    tem_fechamento: !aberturaAtual && Boolean(fechamentoMaisRecente),
    abertura: aberturaAtual
      ? {
          id: aberturaAtual.id,
          numero_caixa: aberturaAtual.numero_caixa as string,
          data_lancamento: aberturaAtual.data_lancamento as string,
          id_responsavel: aberturaAtual.id_responsavel as number,
          responsavel_nome:
            nomesPorId[aberturaAtual.id_responsavel as number] ?? "—",
        }
      : null,
    fechamento: fechamentoMaisRecente
      ? {
          id: fechamentoMaisRecente.id,
          numero_caixa: fechamentoMaisRecente.numero_caixa as string,
          data_lancamento: fechamentoMaisRecente.data_lancamento as string,
          id_responsavel: fechamentoMaisRecente.id_responsavel as number,
          responsavel_nome:
            nomesPorId[fechamentoMaisRecente.id_responsavel as number] ?? "—",
        }
      : null,
    relatorio,
  });
}
