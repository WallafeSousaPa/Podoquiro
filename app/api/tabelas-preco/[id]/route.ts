import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id: idParam } = await context.params;
  const id = decodeURIComponent(String(idParam ?? "")).trim();
  if (!isUuid(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: { nome?: unknown; descricao?: unknown; ativo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existe, error: checkErr } = await supabase
    .from("tabelas_preco")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (checkErr) {
    console.error(checkErr);
    return NextResponse.json({ error: checkErr.message }, { status: 500 });
  }
  if (!existe) {
    return NextResponse.json({ error: "Tabela de preço não encontrada." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.nome !== "undefined") {
    if (typeof body.nome !== "string" || !body.nome.trim()) {
      return NextResponse.json({ error: "Nome da tabela inválido." }, { status: 400 });
    }
    patch.nome = body.nome.trim();
  }

  if (typeof body.descricao !== "undefined") {
    if (body.descricao === null || body.descricao === "") {
      patch.descricao = null;
    } else if (typeof body.descricao === "string") {
      patch.descricao = body.descricao.trim() || null;
    } else {
      return NextResponse.json({ error: "Descrição inválida." }, { status: 400 });
    }
  }

  if (typeof body.ativo !== "undefined") {
    if (typeof body.ativo !== "boolean") {
      return NextResponse.json({ error: "Campo ativo inválido." }, { status: 400 });
    }
    patch.ativo = body.ativo;
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tabelas_preco")
    .update(patch)
    .eq("id", id)
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
