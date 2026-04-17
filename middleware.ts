import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname !== "/login") {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.next();
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.redirect(new URL("/inicio", request.url));
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/login"],
};
