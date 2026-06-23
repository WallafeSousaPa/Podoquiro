import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { id: idParam } = await context.params;
  if (!isUuid(idParam)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: produto, error: prodErr } = await supabase
    .from("produtos")
    .select("id, produto, servico, qtd_estoque")
    .eq("id", idParam)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (prodErr) {
    console.error(prodErr);
    return NextResponse.json({ error: prodErr.message }, { status: 500 });
  }
  if (!produto) {
    return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
  }

  const { data: movimentos, error: movErr } = await supabase
    .from("produtos_movimentacao_estoque")
    .select(
      "id, tipo, quantidade, saldo_anterior, saldo_posterior, origem, id_agendamento, observacao, created_at, usuarios ( nome_completo, usuario )",
    )
    .eq("id_produto", idParam)
    .eq("id_empresa", empresaId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (movErr) {
    console.error(movErr);
    return NextResponse.json({ error: movErr.message }, { status: 500 });
  }

  return NextResponse.json({
    produto,
    data: movimentos ?? [],
  });
}
