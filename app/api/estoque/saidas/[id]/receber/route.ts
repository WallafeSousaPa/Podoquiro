import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaIdDaSessao, parseEmpresaIdValor } from "@/lib/estoque/parse-empresa-id";
import { receberTransferenciaEstoque } from "@/lib/estoque/receber-transferencia";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const sessionEmpresaId = empresaIdDaSessao(session.idEmpresa);
  if (!sessionEmpresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  const idUsuario =
    Number.isFinite(sessionUserId) && sessionUserId > 0 ? sessionUserId : null;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let empresaDestino = sessionEmpresaId;
  try {
    const body = (await request.json()) as { id_empresa?: unknown };
    empresaDestino = parseEmpresaIdValor(body.id_empresa) ?? sessionEmpresaId;
  } catch {
    empresaDestino = sessionEmpresaId;
  }

  const supabase = createAdminClient();
  try {
    await receberTransferenciaEstoque(supabase, {
      id_saida: id,
      id_empresa_destino: empresaDestino,
      id_usuario: idUsuario,
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Não foi possível confirmar o recebimento.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("estoque_saidas")
    .select("*, itens:estoque_saida_itens(*)")
    .eq("id", id)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
