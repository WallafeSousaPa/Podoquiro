import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { assinaturaImagem } from "@/lib/assinatura-imagem";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function usuarioDaEmpresa(id: number, empresaId: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, assinatura")
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .maybeSingle();
  return { supabase, data, error };
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const empresaId = parseEmpresaId(session.idEmpresa);
  const id = Number((await context.params).id);
  if (!empresaId || !Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
  }

  const { data, error } = await usuarioDaEmpresa(id, empresaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  const assinatura = assinaturaImagem(data.assinatura);
  return NextResponse.json({ assinatura: assinatura || null, tem_assinatura: Boolean(assinatura) });
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const empresaId = parseEmpresaId(session.idEmpresa);
  const id = Number((await context.params).id);
  if (!empresaId || !Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
  }

  let body: { assinatura?: unknown };
  try {
    body = (await request.json()) as { assinatura?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const limpando = body.assinatura === null || body.assinatura === "";
  const assinatura = limpando ? "" : assinaturaImagem(body.assinatura);
  if (!limpando && !assinatura) {
    return NextResponse.json({ error: "Desenhe a assinatura no campo indicado." }, { status: 400 });
  }

  const { supabase, data, error } = await usuarioDaEmpresa(id, empresaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  const { error: upErr } = await supabase
    .from("usuarios")
    .update({ assinatura: assinatura || null })
    .eq("id", id)
    .eq("id_empresa", empresaId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ tem_assinatura: Boolean(assinatura) });
}
