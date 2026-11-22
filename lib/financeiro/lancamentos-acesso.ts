import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/auth/session";
import { getUsuarioPodeMenuChave } from "@/lib/dashboard/menu-grupo";
import { createAdminClient } from "@/lib/supabase/admin";

export const CHAVE_MENU_LANCAMENTOS = "financeiro.lancamentos";

type AcessoOk = {
  ok: true;
  supabase: SupabaseClient;
  userId: number;
  empresaId: number;
};

type AcessoNegado = { ok: false; response: NextResponse };

export async function acessoLancamentos(): Promise<AcessoOk | AcessoNegado> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Não autorizado." }, { status: 401 }),
    };
  }

  const empresaId = Number(session.idEmpresa);
  const userId = Number(session.sub);
  if (!Number.isFinite(empresaId) || empresaId <= 0 || !Number.isFinite(userId) || userId <= 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sessão inválida." }, { status: 400 }),
    };
  }

  const supabase = createAdminClient();
  const pode = await getUsuarioPodeMenuChave(supabase, userId, CHAVE_MENU_LANCAMENTOS);
  if (!pode) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sem permissão para os lançamentos." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, supabase, userId, empresaId };
}
