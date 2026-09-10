import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tabelas_preco")
    .select("id, nome, descricao, ativo, created_at, updated_at")
    .order("nome", { ascending: true });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: { nome?: unknown; descricao?: unknown; ativo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) {
    return NextResponse.json({ error: "Informe o nome da tabela de preço." }, { status: 400 });
  }

  const descricao =
    typeof body.descricao === "string" && body.descricao.trim()
      ? body.descricao.trim()
      : null;
  const ativo = typeof body.ativo === "boolean" ? body.ativo : true;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tabelas_preco")
    .insert({ nome, descricao, ativo })
    .select("id, nome, descricao, ativo, created_at, updated_at")
    .single();

  if (error) {
    console.error(error);
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Já existe uma tabela de preço com esse nome." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
