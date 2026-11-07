import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { respostaSeNaoEnfermagem, parseEmpresaId } from "@/lib/enfermagem/acesso";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const supabase = createAdminClient();
  const bloqueio = await respostaSeNaoEnfermagem(
    supabase,
    session,
    "Somente Enfermagem, Administrador ou Diretoria pode excluir o contrato.",
  );
  if (bloqueio) return bloqueio;

  const empresaId = parseEmpresaId(session.idEmpresa);
  const id = Number((await context.params).id);
  if (!empresaId || !Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Contrato inválido." }, { status: 400 });
  }

  const { data: removido, error } = await supabase
    .from("pacientes_contratos_enfermagem")
    .delete()
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!removido || removido.length === 0) {
    return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
