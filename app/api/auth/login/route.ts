import { NextResponse } from "next/server";
import { cookieSecureFromRequest } from "@/lib/auth/cookie-secure";
import { validarCredenciaisLogin } from "@/lib/auth/authenticate-credentials";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(request: Request) {
  let body: { login?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const loginRaw = body.login?.trim() ?? "";
  const password = body.password ?? "";
  const v = await validarCredenciaisLogin(loginRaw, password);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: v.status });
  }

  const token = await createSessionToken({
    sub: String(v.user.id),
    usuario: v.user.usuario,
    idEmpresa: String(v.user.id_empresa),
  });

  const res = NextResponse.json({ ok: true });
  const secure = cookieSecureFromRequest(request);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
