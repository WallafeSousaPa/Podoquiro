import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  let body: { login?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const loginRaw = body.login?.trim();
  const password = body.password;
  if (!loginRaw || !password) {
    return NextResponse.json(
      { error: "Informe usuário ou e-mail e a senha." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: byUsuario, error: errUsuario } = await admin
    .from("usuarios")
    .select("id, usuario, senha_hash, email, id_empresa")
    .eq("ativo", true)
    .eq("usuario", loginRaw)
    .maybeSingle();

  let row = byUsuario;

  if (!row && loginRaw.includes("@")) {
    const { data: byEmail, error: errEmail } = await admin
      .from("usuarios")
      .select("id, usuario, senha_hash, email, id_empresa")
      .eq("ativo", true)
      .ilike("email", loginRaw)
      .maybeSingle();
    if (errEmail) {
      console.error(errEmail);
      return NextResponse.json({ error: "Erro ao validar credenciais." }, { status: 500 });
    }
    row = byEmail;
  }

  if (errUsuario && !row) {
    console.error(errUsuario);
    return NextResponse.json({ error: "Erro ao validar credenciais." }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, row.senha_hash);
  if (!ok) {
    return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
  }

  const token = await createSessionToken({
    sub: String(row.id),
    usuario: row.usuario,
    idEmpresa: String(row.id_empresa),
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
