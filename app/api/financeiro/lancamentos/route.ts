import { NextResponse } from "next/server";
import { acessoLancamentos } from "@/lib/financeiro/lancamentos-acesso";
import {
  categoriaEntradaPorMeio,
  categoriaPermitida,
  competenciaValida,
  periodoCompetencia,
  type NaturezaLancamento,
  type StatusLancamento,
  type TipoLancamento,
} from "@/lib/financeiro/lancamentos";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

type EmpresaJoin = { nome_fantasia: string | null; razao_social: string | null } | null;

function nomeEmpresa(raw: unknown): string {
  const row = (Array.isArray(raw) ? raw[0] : raw) as EmpresaJoin;
  const fantasia = row?.nome_fantasia?.trim() ?? "";
  const razao = row?.razao_social?.trim() ?? "";
  return fantasia || razao || "Geral";
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

export async function GET(request: Request) {
  const acesso = await acessoLancamentos();
  if (!acesso.ok) return acesso.response;

  const competencia = new URL(request.url).searchParams.get("competencia")?.trim() ?? "";
  if (!competenciaValida(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  const { inicio, fim } = periodoCompetencia(competencia);
  const { data, error } = await acesso.supabase
    .from("financeiro_lancamentos")
    .select(
      "id, id_empresa, tipo, natureza, categoria, motivo, valor, data_pagamento, meio_pagamento, meio_pagamento_2, valor_meio_1, valor_meio_2, status, observacao, origem, empresas(nome_fantasia, razao_social)",
    )
    .eq("origem", "manual")
    .gte("data_pagamento", inicio)
    .lte("data_pagamento", fim)
    .order("data_pagamento", { ascending: false })
    .order("id", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lancamentos = (data ?? []).map((row) => ({
    id: row.id as number,
    id_empresa: (row.id_empresa as number | null) ?? null,
    unidade: row.id_empresa == null ? "Geral" : nomeEmpresa(row.empresas),
    tipo: row.tipo as TipoLancamento,
    natureza: row.natureza as NaturezaLancamento,
    categoria: String(row.categoria),
    motivo: String(row.motivo),
    valor: Number(row.valor),
    data: String(row.data_pagamento).slice(0, 10),
    meio: String(row.meio_pagamento),
    meio2: row.meio_pagamento_2 ? String(row.meio_pagamento_2) : null,
    valor1: row.valor_meio_1 == null ? null : Number(row.valor_meio_1),
    valor2: row.valor_meio_2 == null ? null : Number(row.valor_meio_2),
    status: row.status as StatusLancamento,
    observacao: row.observacao ? String(row.observacao) : "",
    origem: String(row.origem),
  }));

  const { data: empresas, error: empErr } = await acesso.supabase
    .from("empresas")
    .select("id, nome_fantasia, razao_social");
  if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 });

  let idCaixa = -1;
  for (const empresa of empresas ?? []) {
    const idEmpresa = empresa.id as number;
    const { data: recebidos, error: rErr } = await acesso.supabase.rpc(
      "financeiro_recebidos_caixa_periodo",
      { p_id_empresa: idEmpresa, p_inicio: inicio, p_fim: fim },
    );
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

    for (const bruto of (recebidos ?? []) as { data_recebimento: string; nome_forma: string; total: number }[]) {
      const forma = String(bruto.nome_forma ?? "").trim();
      const dataRecebimento = String(bruto.data_recebimento ?? "").slice(0, 10);
      const valor = arredondar(Number(bruto.total));
      if (!forma || !/^\d{4}-\d{2}-\d{2}$/.test(dataRecebimento) || valor <= 0) continue;
      lancamentos.push({
        id: idCaixa,
        id_empresa: idEmpresa,
        unidade: nomeEmpresa(empresa),
        tipo: "entrada",
        natureza: "entrada",
        categoria: categoriaEntradaPorMeio(forma),
        motivo: `Recebido no caixa — ${forma}`,
        valor,
        data: dataRecebimento,
        meio: forma,
        meio2: null,
        valor1: null,
        valor2: null,
        status: "pago",
        observacao: "",
        origem: "caixa",
      });
      idCaixa -= 1;
    }
  }

  lancamentos.sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);

  return NextResponse.json({ lancamentos });
}

type Corpo = {
  id_empresa?: unknown;
  tipo?: unknown;
  natureza?: unknown;
  categoria?: unknown;
  motivo?: unknown;
  valor?: unknown;
  data?: unknown;
  meio?: unknown;
  meio2?: unknown;
  valor1?: unknown;
  valor2?: unknown;
  dividir?: unknown;
  status?: unknown;
  observacao?: unknown;
};

export async function POST(request: Request) {
  const acesso = await acessoLancamentos();
  if (!acesso.ok) return acesso.response;

  let body: Corpo;
  try {
    body = (await request.json()) as Corpo;
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }

  const tipo = body.tipo === "entrada" ? "entrada" : body.tipo === "saida" ? "saida" : null;
  if (!tipo) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });

  const natureza: NaturezaLancamento | null =
    tipo === "entrada"
      ? "entrada"
      : body.natureza === "fixa" || body.natureza === "variavel"
        ? body.natureza
        : null;
  if (!natureza) return NextResponse.json({ error: "Classificação inválida." }, { status: 400 });

  const categoria = typeof body.categoria === "string" ? body.categoria.trim() : "";
  if (!categoriaPermitida(natureza, categoria)) {
    return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
  }

  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";
  if (motivo.length < 2 || motivo.length > 160) {
    return NextResponse.json({ error: "Informe o motivo." }, { status: 400 });
  }

  const valor = typeof body.valor === "number" ? arredondar(body.valor) : NaN;
  if (!Number.isFinite(valor) || valor <= 0 || valor > 9_999_999) {
    return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  }

  const data = typeof body.data === "string" ? body.data.trim() : "";
  if (!DATA_RE.test(data)) {
    return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  }

  const meio = typeof body.meio === "string" ? body.meio.trim() : "";
  if (meio.length < 2 || meio.length > 80) {
    return NextResponse.json({ error: "Informe o meio de pagamento." }, { status: 400 });
  }

  const dividir = body.dividir === true;
  let meio2: string | null = null;
  let valor1: number | null = null;
  let valor2: number | null = null;
  if (dividir) {
    meio2 = typeof body.meio2 === "string" ? body.meio2.trim() : "";
    valor1 = typeof body.valor1 === "number" ? arredondar(body.valor1) : NaN;
    valor2 = typeof body.valor2 === "number" ? arredondar(body.valor2) : NaN;
    if (!meio2 || meio2.length > 80 || meio2.toLowerCase() === meio.toLowerCase()) {
      return NextResponse.json({ error: "Informe a segunda conta, diferente da primeira." }, { status: 400 });
    }
    if (!Number.isFinite(valor1) || !Number.isFinite(valor2) || valor1 < 0 || valor2 < 0) {
      return NextResponse.json({ error: "Informe o valor de cada conta." }, { status: 400 });
    }
    if (arredondar(valor1 + valor2) !== valor) {
      return NextResponse.json(
        { error: "A soma das duas contas precisa ser igual ao valor do lançamento." },
        { status: 400 },
      );
    }
  }

  const status: StatusLancamento = body.status === "pendente" ? "pendente" : "pago";
  const observacao = typeof body.observacao === "string" ? body.observacao.trim().slice(0, 200) : "";

  let idEmpresa: number | null = null;
  if (body.id_empresa != null && body.id_empresa !== "" && body.id_empresa !== "geral") {
    const n = Number(body.id_empresa);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: "Unidade inválida." }, { status: 400 });
    }
    const { data: emp, error: eErr } = await acesso.supabase
      .from("empresas")
      .select("id")
      .eq("id", n)
      .maybeSingle();
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
    if (!emp) return NextResponse.json({ error: "Unidade não encontrada." }, { status: 404 });
    idEmpresa = n;
  }

  const { data: criado, error } = await acesso.supabase
    .from("financeiro_lancamentos")
    .insert({
      id_empresa: idEmpresa,
      id_usuario: acesso.userId,
      tipo,
      natureza,
      categoria,
      motivo,
      valor,
      data_pagamento: data,
      meio_pagamento: meio,
      meio_pagamento_2: meio2,
      valor_meio_1: valor1,
      valor_meio_2: valor2,
      status,
      observacao: observacao || null,
      origem: "manual",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: criado.id });
}
