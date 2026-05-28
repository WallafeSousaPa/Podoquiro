import { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/auth/session";
import { getUsuarioPodeMenuNotaFiscal } from "@/lib/dashboard/menu-grupo";
import { createAdminClient } from "@/lib/supabase/admin";

/** Bloqueia API de Nota Fiscal para quem não é Administrador / Administrativo. */
export async function respostaSeSemPermissaoNotaFiscal(
  session: SessionPayload | null,
): Promise<NextResponse | null> {
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const userId = Number(session.sub);
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const pode = await getUsuarioPodeMenuNotaFiscal(supabase, userId);
  if (!pode) {
    return NextResponse.json(
      { error: "Sem permissão para acessar Nota Fiscal." },
      { status: 403 },
    );
  }

  return null;
}
