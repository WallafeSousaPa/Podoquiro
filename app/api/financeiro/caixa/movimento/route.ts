import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUsuarioPodeRelatorioCaixa } from "@/lib/dashboard/menu-grupo";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
      { error: "Sem permissão para consultar movimentação de caixa." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const deParam = url.searchParams.get("de")?.trim();
  const ateParam = url.searchParams.get("ate")?.trim();
  const de = deParam && DATE_RE.test(deParam) ? deParam : hoje;
  const ate = ateParam && DATE_RE.test(ateParam) ? ateParam : de;

  const inicioIso = `${de}T00:00:00.000-03:00`;
  const fimIso = `${ate}T23:59:59.999-03:00`;

  const tipoEntrada = url.searchParams.get("tipo_entrada")?.trim() ?? "";
  const formaPagamento = url.searchParams.get("forma_pagamento")?.trim() ?? "";
  const busca = url.searchParams.get("busca")?.trim() ?? "";
  const atendimentoIdParam = url.searchParams.get("atendimento_id")?.trim();
  const atendimentoId =
    atendimentoIdParam && Number.isFinite(Number(atendimentoIdParam))
      ? Number(atendimentoIdParam)
      : null;

  let q = supabase
    .from("caixa_movimento")
    .select(
      `
      id,
      data_movimentacao,
      data_vencimento,
      descricao,
      tipo_entrada,
      forma_pagamento,
      parcela,
      valor,
      atendimento_id,
      id_pagamento,
      created_at
    `,
    )
    .eq("id_empresa", empresaId)
    .gte("data_movimentacao", inicioIso)
    .lte("data_movimentacao", fimIso)
    .order("data_movimentacao", { ascending: false });

  if (tipoEntrada) {
    q = q.eq("tipo_entrada", tipoEntrada);
  }
  if (formaPagamento) {
    q = q.ilike("forma_pagamento", `%${formaPagamento}%`);
  }
  if (atendimentoId != null && atendimentoId > 0) {
    q = q.eq("atendimento_id", atendimentoId);
  }
  if (busca) {
    q = q.or(`descricao.ilike.%${busca}%,forma_pagamento.ilike.%${busca}%`);
  }

  const { data, error } = await q;
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((r) => ({
    id: r.id as number,
    data_movimentacao: r.data_movimentacao as string,
    data_vencimento: r.data_vencimento as string | null,
    descricao: r.descricao as string,
    tipo_entrada: r.tipo_entrada as string,
    forma_pagamento: r.forma_pagamento as string,
    parcela: r.parcela as string | null,
    valor: Number(r.valor),
    atendimento_id: r.atendimento_id as number | null,
    id_pagamento: r.id_pagamento as number | null,
    created_at: r.created_at as string,
  }));

  const totalEntradasPeriodo =
    Math.round(rows.reduce((s, r) => s + r.valor, 0) * 100) / 100;

  const { data: todosValores, error: saldoErr } = await supabase
    .from("caixa_movimento")
    .select("valor")
    .eq("id_empresa", empresaId);

  if (saldoErr) {
    console.error(saldoErr);
    return NextResponse.json({ error: saldoErr.message }, { status: 500 });
  }

  const saldoAtual =
    Math.round(
      (todosValores ?? []).reduce((s, r) => s + Number(r.valor), 0) * 100,
    ) / 100;

  const { data: formasRows } = await supabase
    .from("formas_pagamento")
    .select("nome")
    .eq("ativo", true)
    .order("nome");

  const formasDistintas = [
    ...new Set((formasRows ?? []).map((f) => String(f.nome).trim()).filter(Boolean)),
  ];

  return NextResponse.json({
    data: rows,
    filtros: { de, ate, tipo_entrada: tipoEntrada || null, forma_pagamento: formaPagamento || null, busca: busca || null, atendimento_id: atendimentoId },
    totais: {
      entradas: totalEntradasPeriodo,
      saidas: 0,
      saldo: totalEntradasPeriodo,
    },
    saldo_atual: saldoAtual,
    formas_pagamento: formasDistintas,
  });
}
