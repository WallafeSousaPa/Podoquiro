import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("empresa_agenda_grupos")
    .select("id_grupo_usuarios")
    .eq("id_empresa", empresaId);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: (data ?? []).map((r) => ({ id_grupo_usuarios: r.id_grupo_usuarios as number })),
  });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let body: { ids_grupo_usuarios?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const raw = body.ids_grupo_usuarios;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: "Informe ids_grupo_usuarios (array de números)." },
      { status: 400 },
    );
  }

  const ids = raw
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
  const unique = [...new Set(ids)];

  const supabase = createAdminClient();

  const { error: delErr } = await supabase
    .from("empresa_agenda_grupos")
    .delete()
    .eq("id_empresa", empresaId);

  if (delErr) {
    console.error(delErr);
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (unique.length === 0) {
    return NextResponse.json({ ok: true, data: [] });
  }

  const { data: gruposOk, error: gErr } = await supabase
    .from("usuarios_grupos")
    .select("id")
    .in("id", unique)
    .eq("ativo", true);

  if (gErr) {
    console.error(gErr);
    return NextResponse.json({ error: gErr.message }, { status: 500 });
  }

  const found = new Set((gruposOk ?? []).map((r) => r.id as number));
  for (const id of unique) {
    if (!found.has(id)) {
      return NextResponse.json(
        { error: `Grupo de usuários inválido ou inativo (id ${id}).` },
        { status: 400 },
      );
    }
  }

  const insertRows = unique.map((id_grupo_usuarios) => ({
    id_empresa: empresaId,
    id_grupo_usuarios,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("empresa_agenda_grupos")
    .insert(insertRows)
    .select("id_grupo_usuarios");

  if (insErr) {
    console.error(insErr);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: inserted ?? [] });
}
