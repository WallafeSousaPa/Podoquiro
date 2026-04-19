import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

async function empresaExists(
  supabase: ReturnType<typeof createAdminClient>,
  id: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("empresas")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

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

  let body: { id_empresa?: unknown; nome_sala?: string; ativo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existe, error: checkErr } = await supabase
    .from("salas")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (checkErr) {
    console.error(checkErr);
    return NextResponse.json({ error: checkErr.message }, { status: 500 });
  }
  if (!existe) {
    return NextResponse.json({ error: "Sala não encontrada." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.id_empresa !== "undefined") {
    const idEmpresa = Number(body.id_empresa);
    if (!Number.isFinite(idEmpresa) || idEmpresa <= 0) {
      return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
    }
    if (!(await empresaExists(supabase, idEmpresa))) {
      return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
    }
    patch.id_empresa = idEmpresa;
  }

  if (typeof body.nome_sala !== "undefined") {
    if (typeof body.nome_sala !== "string" || !body.nome_sala.trim()) {
      return NextResponse.json(
        { error: "Nome da sala inválido." },
        { status: 400 },
      );
    }
    patch.nome_sala = body.nome_sala.trim();
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
    .from("salas")
    .update(patch)
    .eq("id", id)
    .select(
      "id, id_empresa, nome_sala, ativo, ultima_atualizacao, empresas(nome_fantasia)",
    )
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const empRaw = data.empresas as
    | { nome_fantasia: string }
    | { nome_fantasia: string }[]
    | null
    | undefined;
  const nomeFantasia = Array.isArray(empRaw)
    ? (empRaw[0]?.nome_fantasia ?? null)
    : (empRaw?.nome_fantasia ?? null);
  return NextResponse.json({
    data: {
      id: data.id,
      id_empresa: data.id_empresa,
      nome_sala: data.nome_sala,
      ativo: data.ativo,
      ultima_atualizacao: data.ultima_atualizacao,
      nome_fantasia: nomeFantasia,
    },
  });
}
