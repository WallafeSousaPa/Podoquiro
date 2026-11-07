import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { parseEmpresaId, respostaSeNaoEnfermagem } from "@/lib/enfermagem/acesso";
import { createAdminClient } from "@/lib/supabase/admin";

/** Quais agendamentos do dia já têm ficha de enfermagem salva. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 400);

  if (ids.length === 0) {
    return NextResponse.json({ ids: [] as number[] });
  }

  const supabase = createAdminClient();
  const bloqueio = await respostaSeNaoEnfermagem(supabase, session);
  if (bloqueio) return bloqueio;

  const { data, error } = await supabase
    .from("pacientes_ficha_enfermagem")
    .select("id_agendamento")
    .eq("id_empresa", empresaId)
    .in("id_agendamento", ids);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const salvos = (data ?? [])
    .map((r) => r.id_agendamento as number)
    .filter((n) => Number.isFinite(n));

  return NextResponse.json({ ids: salvos });
}
