import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaIdDaSessao } from "@/lib/estoque/parse-empresa-id";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!empresaIdDaSessao(session.idEmpresa)) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("estoque_saidas")
    .select("*, itens:estoque_saida_itens(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Saída não encontrada." }, { status: 404 });
  }

  const itens = Array.isArray(data.itens)
    ? [...data.itens].sort((a: { n_item: number }, b: { n_item: number }) => a.n_item - b.n_item)
    : [];

  return NextResponse.json({ data: { ...data, itens } });
}
