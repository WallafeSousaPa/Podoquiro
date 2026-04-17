import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./constants";

export { SESSION_COOKIE };

export type SessionPayload = {
  sub: string;
  usuario: string;
  idEmpresa: string;
};

function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("Defina AUTH_SECRET (string longa e aleatória).");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(payload: SessionPayload) {
  return await new SignJWT({
    usuario: payload.usuario,
    idEmpresa: payload.idEmpresa,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const sub = payload.sub;
    const usuario = payload.usuario;
    const idEmpresa = payload.idEmpresa;
    if (
      typeof sub !== "string" ||
      typeof usuario !== "string" ||
      typeof idEmpresa !== "string"
    ) {
      return null;
    }
    return { sub, usuario, idEmpresa };
  } catch {
    return null;
  }
}
