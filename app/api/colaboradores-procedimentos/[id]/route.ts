import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseComissao(v: unknown): number | null {
  if (v === null || typeof v === "undefined") return null;
  if (typeof v === "number") {
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
  }
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  }
  return null;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: { comissao_porcentagem?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!Object.prototype.hasOwnProperty.call(body, "comissao_porcentagem")) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const comissao = parseComissao(body.comissao_porcentagem);
  if (
    body.comissao_porcentagem !== null &&
    body.comissao_porcentagem !== undefined &&
    comissao === null &&
    typeof body.comissao_porcentagem === "string" &&
    String(body.comissao_porcentagem).trim() !== ""
  ) {
    return NextResponse.json(
      { error: "Comissão deve ser entre 0 e 100% ou vazio." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: row, error: findErr } = await supabase
    .from("colaboradores_procedimentos")
    .select("id, id_usuario")
    .eq("id", id)
    .maybeSingle();

  if (findErr) {
    console.error(findErr);
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  }

  const { data: uEmp, error: uErr } = await supabase
    .from("usuarios")
    .select("id_empresa")
    .eq("id", row.id_usuario as number)
    .maybeSingle();
  if (uErr) {
    console.error(uErr);
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }
  if (!uEmp || (uEmp.id_empresa as number) !== empresaId) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("colaboradores_procedimentos")
    .update({ comissao_porcentagem: comissao })
    .eq("id", id)
    .select(
      "id, id_usuario, id_procedimento, comissao_porcentagem, ultima_atualizacao",
    )
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: row, error: findErr } = await supabase
    .from("colaboradores_procedimentos")
    .select("id, id_usuario")
    .eq("id", id)
    .maybeSingle();

  if (findErr) {
    console.error(findErr);
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  }

  const { data: uEmp, error: uErr } = await supabase
    .from("usuarios")
    .select("id_empresa")
    .eq("id", row.id_usuario as number)
    .maybeSingle();
  if (uErr) {
    console.error(uErr);
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }
  if (!uEmp || (uEmp.id_empresa as number) !== empresaId) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  const { error } = await supabase.from("colaboradores_procedimentos").delete().eq("id", id);
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
