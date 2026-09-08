import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUsuarioPodeExcluirImportacaoEstoque } from "@/lib/dashboard/menu-grupo";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaIdDaSessao } from "@/lib/estoque/parse-empresa-id";
import { reverterSaidaEstoque } from "@/lib/estoque/reverter-saida";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!empresaIdDaSessao(session.idEmpresa)) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  const idUsuario =
    Number.isFinite(sessionUserId) && sessionUserId > 0 ? sessionUserId : null;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const podeCancelar = await getUsuarioPodeExcluirImportacaoEstoque(
    supabase,
    idUsuario ?? 0,
  );
  if (!podeCancelar) {
    return NextResponse.json(
      { error: "Somente Administrador ou Administrativo pode cancelar uma saída." },
      { status: 403 },
    );
  }

  const { data: saida, error: saidaErr } = await supabase
    .from("estoque_saidas")
    .select("id, id_empresa, status, tipo")
    .eq("id", id)
    .maybeSingle();

  if (saidaErr) {
    return NextResponse.json({ error: saidaErr.message }, { status: 500 });
  }
  if (!saida) {
    return NextResponse.json({ error: "Saída não encontrada." }, { status: 404 });
  }
  if (saida.status === "cancelada") {
    return NextResponse.json({ error: "Esta saída já está cancelada." }, { status: 400 });
  }

  const { data: itens, error: itensErr } = await supabase
    .from("estoque_saida_itens")
    .select("id, id_produto, produto, qtd")
    .eq("id_saida", id)
    .order("n_item", { ascending: true });

  if (itensErr) {
    return NextResponse.json({ error: itensErr.message }, { status: 500 });
  }

  try {
    await reverterSaidaEstoque(supabase, {
      id_empresa: Number(saida.id_empresa),
      id_saida: id,
      itens: itens ?? [],
      id_usuario: idUsuario,
      observacao: `Estorno da saída ${saida.tipo}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não foi possível cancelar a saída.";
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
