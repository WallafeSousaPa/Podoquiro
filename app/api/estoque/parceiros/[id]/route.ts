import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { erroUnicoDocParceiro, parseParceiroBody } from "@/lib/estoque/parceiro-campos";
import { empresaIdDaSessao } from "@/lib/estoque/parse-empresa-id";
import { tabelaParceiro } from "@/lib/estoque/parceiro-campos";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!empresaIdDaSessao(session.idEmpresa)) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const tabela = tabelaParceiro(body.papel);
  if (!tabela) {
    return NextResponse.json(
      { error: "Informe papel=fornecedor ou papel=comprador." },
      { status: 400 },
    );
  }

  const parsed = parseParceiroBody(body, { patch: true });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(tabela)
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    const unico = erroUnicoDocParceiro(error.message);
    return NextResponse.json({ error: unico ?? error.message }, { status: unico ? 409 : 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Cadastro não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!empresaIdDaSessao(session.idEmpresa)) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const tabela = tabelaParceiro(searchParams.get("papel"));
  if (!tabela) {
    return NextResponse.json(
      { error: "Informe papel=fornecedor ou papel=comprador." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from(tabela).delete().eq("id", id);
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
