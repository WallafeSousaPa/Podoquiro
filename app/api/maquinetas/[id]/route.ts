import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: { nome?: unknown; ativo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existe, error: checkErr } = await supabase
    .from("maquinetas")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (checkErr) {
    console.error(checkErr);
    return NextResponse.json({ error: checkErr.message }, { status: 500 });
  }
  if (!existe) {
    return NextResponse.json(
      { error: "Maquineta não encontrada." },
      { status: 404 },
    );
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.nome !== "undefined") {
    if (typeof body.nome !== "string" || !body.nome.trim()) {
      return NextResponse.json(
        { error: "Nome da maquineta inválido." },
        { status: 400 },
      );
    }
    patch.nome = body.nome.trim();
  }

  if (typeof body.ativo !== "undefined") {
    if (typeof body.ativo !== "boolean") {
      return NextResponse.json({ error: "Campo ativo inválido." }, { status: 400 });
    }
    patch.ativo = body.ativo;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("maquinetas")
    .update(patch)
    .eq("id", id)
    .select("id, nome, ativo")
    .single();

  if (error) {
    console.error(error);
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Já existe uma maquineta com esse nome." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
