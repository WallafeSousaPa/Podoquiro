import { NextResponse } from "next/server";
import { getPodeVerTodosAgendamentos } from "@/lib/agenda/permissoes-calendario";
import { getSession } from "@/lib/auth/session";
import { carregarCaixaAgendamentosRows } from "@/lib/financeiro/caixa-agendamentos-rows";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const empresaId = Number(session.idEmpresa);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const data = searchParams.get("data")?.trim() ?? "";

  try {
    const supabase = createAdminClient();
    const podeVerTodos = await getPodeVerTodosAgendamentos(
      supabase,
      sessionUserId,
    );
    const rows = await carregarCaixaAgendamentosRows(supabase, {
      empresaId,
      sessionUserId,
      podeVerTodosAgendamentos: podeVerTodos,
      dataYmd: data,
    });
    return NextResponse.json({ rows });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Não foi possível carregar os dados.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
