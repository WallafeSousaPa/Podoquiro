import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { darEntradaNfeImportacao } from "@/lib/estoque/dar-entrada-nfe";
import { empresaIdDaSessao } from "@/lib/estoque/parse-empresa-id";
import { montarPreviewImportacao } from "@/lib/estoque/preview-nfe-importacao";
import type { ProdutoEstoqueMatch } from "@/lib/estoque/vincular-produtos-nfe";

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
  if (nota.status === "entrada_realizada") {
    return NextResponse.json(
      { error: "A entrada desta NF-e já foi realizada." },
      { status: 409 },
    );
  }

  const empresaId = Number(nota.id_empresa);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    return NextResponse.json({ error: "Empresa da nota inválida." }, { status: 400 });
  }

  const [{ data: itens, error: itensErr }, { data: produtos, error: prodErr }] =
    await Promise.all([
      supabase.from("estoque_nfe_importacao_itens").select("*").eq("id_importacao", id),
      supabase
        .from("produtos")
        .select("id, produto, sku, barcode, qtd_estoque, ncm, servico")
        .eq("id_empresa", empresaId)
        .eq("servico", false),
    ]);

  if (itensErr || prodErr) {
    console.error(itensErr ?? prodErr);
    return NextResponse.json(
      { error: (itensErr ?? prodErr)?.message ?? "Erro ao carregar dados." },
      { status: 500 },
    );
  }

  if (!itens || itens.length === 0) {
    return NextResponse.json({ error: "A nota não possui itens." }, { status: 400 });
  }

  let body: { quantidades?: unknown } = {};
  try {
    const raw = await _request.text();
    if (raw.trim()) {
      body = JSON.parse(raw) as { quantidades?: unknown };
    }
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const qtdPorId = new Map<string, number>();
  if (body.quantidades != null) {
    if (typeof body.quantidades !== "object" || Array.isArray(body.quantidades)) {
      return NextResponse.json(
        { error: "Informe as quantidades no formato { id_item: quantidade }." },
        { status: 400 },
      );
    }
    for (const [itemId, rawQtd] of Object.entries(body.quantidades as Record<string, unknown>)) {
      if (!isUuid(itemId)) {
        return NextResponse.json({ error: "ID de item inválido." }, { status: 400 });
      }
      const n =
        typeof rawQtd === "number"
          ? rawQtd
          : typeof rawQtd === "string"
            ? Number.parseInt(rawQtd, 10)
            : NaN;
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return NextResponse.json(
          { error: "Quantidade deve ser um número inteiro maior ou igual a zero." },
          { status: 400 },
        );
      }
      qtdPorId.set(itemId, n);
    }
  }

  const idsNota = new Set(itens.map((it) => String(it.id)));
  for (const itemId of qtdPorId.keys()) {
    if (!idsNota.has(itemId)) {
      return NextResponse.json(
        { error: "Há quantidade de item que não pertence a esta nota." },
        { status: 400 },
      );
    }
  }

  const itensComQtd = itens.map((it) => ({
    ...it,
    qtd_entrada: qtdPorId.has(String(it.id))
      ? qtdPorId.get(String(it.id))
      : undefined,
  }));

  try {
    const resultado = await darEntradaNfeImportacao(supabase, {
      id_empresa: empresaId,
      id_importacao: id,
      numero_nf: Number(nota.numero_nf),
      chave_acesso: String(nota.chave_acesso),
      id_usuario: idUsuario,
      itens: itensComQtd,
      produtos: (produtos ?? []) as ProdutoEstoqueMatch[],
    });

    const [{ data: notaAtual }, { data: itensAtual }, { data: produtosAtual }] =
      await Promise.all([
        supabase
          .from("estoque_nfe_importacoes")
          .select("*")
          .eq("id", id)
          .eq("id_empresa", empresaId)
          .single(),
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

    const preview = notaAtual
      ? montarPreviewImportacao(
          notaAtual,
          itensAtual ?? [],
          (produtosAtual ?? []) as ProdutoEstoqueMatch[],
        )
      : null;

    return NextResponse.json({ data: preview, resultado });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Falha ao dar entrada no estoque.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
