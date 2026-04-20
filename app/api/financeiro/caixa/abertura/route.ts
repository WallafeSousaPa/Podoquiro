import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  let body: { data_referencia?: string; numero_caixa?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const dataRef = typeof body.data_referencia === "string" ? body.data_referencia.trim() : "";
  if (!DATA_RE.test(dataRef)) {
    return NextResponse.json(
      { error: "Informe data_referencia (YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  const numeroCaixa =
    typeof body.numero_caixa === "string" && body.numero_caixa.trim()
      ? body.numero_caixa.trim().slice(0, 16)
      : "01";

  const supabase = createAdminClient();

  const { data: uOk, error: uErr } = await supabase
    .from("usuarios")
    .select("id")
    .eq("id", sessionUserId)
    .eq("id_empresa", empresaId)
    .maybeSingle();
  if (uErr) {
    console.error(uErr);
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }
  if (!uOk) {
    return NextResponse.json({ error: "Usuário inválido." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("caixa_lancamentos")
    .insert({
      numero_caixa: numeroCaixa,
      tipo: "abertura",
      id_responsavel: sessionUserId,
      id_empresa: empresaId,
      data_referencia: dataRef,
    })
    .select("id, data_lancamento, numero_caixa, data_referencia")
    .single();

  if (error) {
    console.error(error);
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "O caixa já foi aberto nesta data." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
