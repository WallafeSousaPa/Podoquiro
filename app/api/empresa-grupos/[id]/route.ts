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

  let body: { grupo_empresa?: string; ativo?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const patch: Record<string, string | boolean> = {};
  if (typeof body.grupo_empresa === "string") {
    const nome = body.grupo_empresa.trim();
    if (!nome) {
      return NextResponse.json(
        { error: "Nome do grupo de empresas não pode ser vazio." },
        { status: 400 },
      );
    }
    patch.grupo_empresa = nome;
  }
  if (typeof body.ativo === "boolean") {
    patch.ativo = body.ativo;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Nada para atualizar." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("empresa_grupos")
    .update(patch)
    .eq("id", id)
    .select("id, grupo_empresa, data_atualizacao, ativo")
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ data });
}
