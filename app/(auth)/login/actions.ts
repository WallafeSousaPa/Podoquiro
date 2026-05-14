"use server";

import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { validarCredenciaisLogin } from "@/lib/auth/authenticate-credentials";
import { cookieSecureFromHeaders } from "@/lib/auth/cookie-secure";
import { createSessionToken } from "@/lib/auth/session";

export type EntrarResultado = { ok: true } | { ok: false; error: string };

/**
 * Login via Server Action para o cookie de sessão ser aplicado de forma confiável
 * (alguns navegadores / rede local com fetch → Route Handler não persistem o cookie).
 */
export async function entrarComCredenciais(
  login: string,
  password: string,
): Promise<EntrarResultado> {
  const v = await validarCredenciaisLogin(login, password);
  if (!v.ok) {
    return { ok: false, error: v.error };
  }

  const token = await createSessionToken({
    sub: String(v.user.id),
    usuario: v.user.usuario,
    idEmpresa: String(v.user.id_empresa),
  });

  const jar = await cookies();
  const h = await headers();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: cookieSecureFromHeaders(h),
    maxAge: 60 * 60 * 24 * 7,
  });

  return { ok: true };
}
