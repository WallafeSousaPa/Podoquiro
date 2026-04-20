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

  let body: {
    grupo_usuarios?: string;
    ativo?: boolean;
    calendario?: boolean;
    agenda_apenas_coluna_propria?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const patch: Record<string, string | boolean> = {};
  if (typeof body.calendario === "boolean") {
    patch.calendario = body.calendario;
  }
  if (typeof body.agenda_apenas_coluna_propria === "boolean") {
    patch.agenda_apenas_coluna_propria = body.agenda_apenas_coluna_propria;
  }
  if (typeof body.grupo_usuarios === "string") {
    const nome = body.grupo_usuarios.trim();
    if (!nome) {
      return NextResponse.json(
        { error: "Nome do grupo não pode ser vazio." },
        { status: 400 },
      );
    }
    patch.grupo_usuarios = nome;
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
    .from("usuarios_grupos")
    .update(patch)
    .eq("id", id)
    .select(
      "id, grupo_usuarios, data_atualizacao, ativo, calendario, agenda_apenas_coluna_propria",
    )
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
