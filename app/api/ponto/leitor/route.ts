import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { statusLeitorFs80h } from "@/lib/ponto/futronic-fs80h";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const status = await statusLeitorFs80h();
  return NextResponse.json(status, { status: status.ok ? 200 : 503 });
}
