import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

function normalizarCodigoBandeira(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 0 || d.length > 2) return null;
  return d.padStart(2, "0").slice(0, 2);
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

  let body: { codigo?: unknown; nome_bandeira?: unknown; ativo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existe, error: checkErr } = await supabase
    .from("bandeiras")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (checkErr) {
    console.error(checkErr);
    return NextResponse.json({ error: checkErr.message }, { status: 500 });
  }
  if (!existe) {
    return NextResponse.json({ error: "Bandeira não encontrada." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.codigo !== "undefined") {
    if (typeof body.codigo !== "string") {
      return NextResponse.json({ error: "Código inválido." }, { status: 400 });
    }
    const codigo = normalizarCodigoBandeira(body.codigo.trim());
    if (!codigo) {
      return NextResponse.json(
        { error: "Código da bandeira inválido (use 2 dígitos)." },
        { status: 400 },
      );
    }
    patch.codigo = codigo;
  }

  if (typeof body.nome_bandeira !== "undefined") {
    if (typeof body.nome_bandeira !== "string" || !body.nome_bandeira.trim()) {
      return NextResponse.json({ error: "Nome da bandeira inválido." }, { status: 400 });
    }
    patch.nome_bandeira = body.nome_bandeira.trim();
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
    .from("bandeiras")
    .update(patch)
    .eq("id", id)
    .select("id, codigo, nome_bandeira, ativo")
    .single();

  if (error) {
    console.error(error);
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Já existe bandeira com esse código ou nome." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
