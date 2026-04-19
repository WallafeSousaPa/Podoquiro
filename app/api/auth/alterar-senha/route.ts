import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const MIN_LEN = 6;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: { senha_atual?: string; senha_nova?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const senhaAtual = typeof body.senha_atual === "string" ? body.senha_atual : "";
  const senhaNova = typeof body.senha_nova === "string" ? body.senha_nova : "";

  if (!senhaAtual.trim() || !senhaNova.trim()) {
    return NextResponse.json(
      { error: "Informe a senha atual e a nova senha." },
      { status: 400 },
    );
  }

  if (senhaNova.length < MIN_LEN) {
    return NextResponse.json(
      { error: `A nova senha deve ter pelo menos ${MIN_LEN} caracteres.` },
      { status: 400 },
    );
  }

  if (senhaAtual === senhaNova) {
    return NextResponse.json(
      { error: "A nova senha deve ser diferente da senha atual." },
      { status: 400 },
    );
  }

  const userId = Number(session.sub);
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row, error: fetchErr } = await supabase
    .from("usuarios")
    .select("id, senha_hash")
    .eq("id", userId)
    .maybeSingle();

  if (fetchErr) {
    console.error(fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row?.senha_hash) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  const ok = await bcrypt.compare(senhaAtual, row.senha_hash);
  if (!ok) {
    return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
  }

  const senhaHash = await bcrypt.hash(senhaNova, 10);
  const { error: updErr } = await supabase
    .from("usuarios")
    .update({ senha_hash: senhaHash })
    .eq("id", userId);

  if (updErr) {
    console.error(updErr);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
