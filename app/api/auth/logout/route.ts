import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { cookieSecureFromRequest } from "@/lib/auth/cookie-secure";

export async function POST(request: Request) {
  const res = NextResponse.json({ ok: true });
  const secure = cookieSecureFromRequest(request);
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: 0,
  });
  return res;
}
