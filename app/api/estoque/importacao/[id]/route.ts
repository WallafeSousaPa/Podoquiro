import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUsuarioPodeExcluirImportacaoEstoque } from "@/lib/dashboard/menu-grupo";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaIdDaSessao } from "@/lib/estoque/parse-empresa-id";
import { montarPreviewImportacao } from "@/lib/estoque/preview-nfe-importacao";
import { reverterEntradaNfeImportacao } from "@/lib/estoque/reverter-entrada-nfe";
import type { ProdutoEstoqueMatch } from "@/lib/estoque/vincular-produtos-nfe";

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

  const { data: nota, error: notaErr } = await supabase
    .from("estoque_nfe_importacoes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (notaErr) {
    console.error(notaErr);
    return NextResponse.json({ error: notaErr.message }, { status: 500 });
  }
  if (!nota) {
    return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });
  }

  const empresaId = Number(nota.id_empresa);

  const [{ data: itens, error: itensErr }, { data: produtos, error: prodErr }] =
    await Promise.all([
      supabase
        .from("estoque_nfe_importacao_itens")
        .select("*")
        .eq("id_importacao", id)
        .order("n_item", { ascending: true }),
      supabase
        .from("produtos")
        .select("id, produto, sku, barcode, qtd_estoque, ncm, servico")
        .eq("id_empresa", empresaId)
        .eq("servico", false),
    ]);

  if (itensErr || prodErr) {
    console.error(itensErr ?? prodErr);
    return NextResponse.json(
      { error: (itensErr ?? prodErr)?.message ?? "Erro ao carregar itens." },
      { status: 500 },
    );
  }

  const preview = montarPreviewImportacao(
    nota,
    itens ?? [],
    (produtos ?? []) as ProdutoEstoqueMatch[],
  );

  return NextResponse.json({ data: preview });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  if (!empresaIdDaSessao(session.idEmpresa)) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const sessionUserId = Number(session.sub);
  const idUsuario =
    Number.isFinite(sessionUserId) && sessionUserId > 0 ? sessionUserId : null;

  const podeExcluir = await getUsuarioPodeExcluirImportacaoEstoque(
    supabase,
    idUsuario ?? 0,
  );
  if (!podeExcluir) {
    return NextResponse.json(
      { error: "Somente Administrador ou Administrativo podem excluir a importação." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const { data: nota, error: notaErr } = await supabase
    .from("estoque_nfe_importacoes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (notaErr) {
    console.error(notaErr);
    return NextResponse.json({ error: notaErr.message }, { status: 500 });
  }
  if (!nota) {
    return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });
  }

  const empresaId = Number(nota.id_empresa);
  let reversao: { revertidos: number; unidades: number } | null = null;

  if (nota.status === "entrada_realizada") {
    const { data: itens, error: itensErr } = await supabase
      .from("estoque_nfe_importacao_itens")
      .select("id_produto, qtd_entrada, q_com")
      .eq("id_importacao", id);

    if (itensErr) {
      console.error(itensErr);
      return NextResponse.json({ error: itensErr.message }, { status: 500 });
    }

    try {
      reversao = await reverterEntradaNfeImportacao(supabase, {
        id_empresa: empresaId,
        numero_nf: Number(nota.numero_nf),
        chave_acesso: String(nota.chave_acesso),
        id_usuario: idUsuario,
        itens: itens ?? [],
      });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Falha ao reverter o estoque.";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const { error: delErr } = await supabase
    .from("estoque_nfe_importacoes")
    .delete()
    .eq("id", id)
    .eq("id_empresa", empresaId);

  if (delErr) {
    console.error(delErr);
    return NextResponse.json(
      {
        error:
          reversao != null
            ? `O estoque foi revertido, mas a nota não pôde ser excluída: ${delErr.message}`
            : delErr.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    revertida: nota.status === "entrada_realizada",
    reversao,
  });
}
