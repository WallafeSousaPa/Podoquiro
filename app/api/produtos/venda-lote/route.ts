import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { usuarioPodeEditarPrecoVendaProduto } from "@/lib/dashboard/menus-permissoes";
import { registrarHistoricoPrecoVenda } from "@/lib/estoque/registrar-movimentacao-estoque";
import {
  parseNumeroNaoNegativo,
  precoVendaPorPercentual,
  textoHistoricoPrecoVenda,
} from "@/lib/estoque/preco-venda-produto";

function parseEmpresaId(idEmpresa: unknown) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isUuid(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const sessionEmpresaId = parseEmpresaId(session.idEmpresa);
  if (!sessionEmpresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  const idUsuario =
    Number.isFinite(sessionUserId) && sessionUserId > 0 ? sessionUserId : null;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const empresaId = parseEmpresaId(body.id_empresa) ?? sessionEmpresaId;
  const percentual = parseNumeroNaoNegativo(body.percentual);
  if (percentual === null) {
    return NextResponse.json(
      { error: "Informe um percentual sobre o custo válido (≥ 0)." },
      { status: 400 },
    );
  }

  const idsRaw = Array.isArray(body.ids) ? body.ids : [];
  const ids = [...new Set(idsRaw.filter(isUuid))];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um produto." }, { status: 400 });
  }
  if (ids.length > 300) {
    return NextResponse.json({ error: "Selecione no máximo 300 produtos." }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!(await usuarioPodeEditarPrecoVendaProduto(supabase, idUsuario ?? 0))) {
    return NextResponse.json(
      { error: "Sem permissão para cadastrar ou alterar o valor de venda." },
      { status: 403 },
    );
  }

  const { data: produtos, error } = await supabase
    .from("produtos")
    .select("id, produto, preco, preco_venda, qtd_estoque, servico")
    .eq("id_empresa", empresaId)
    .eq("servico", false)
    .in("id", ids);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const encontrados = produtos ?? [];
  if (encontrados.length === 0) {
    return NextResponse.json({ error: "Nenhum produto válido para atualizar." }, { status: 400 });
  }

  let atualizados = 0;
  for (const p of encontrados) {
    const custo = Number(p.preco) || 0;
    const vendaNova = precoVendaPorPercentual(custo, percentual);
    const vendaAntes = p.preco_venda != null ? Number(p.preco_venda) : null;
    const { error: upErr } = await supabase
      .from("produtos")
      .update({
        percentual_sobre_custo: percentual,
        preco_venda: vendaNova,
      })
      .eq("id", p.id)
      .eq("id_empresa", empresaId);
    if (upErr) {
      console.error(upErr);
      return NextResponse.json(
        { error: `Não foi possível atualizar "${p.produto}".` },
        { status: 400 },
      );
    }
    await registrarHistoricoPrecoVenda(supabase, {
      id_empresa: empresaId,
      id_produto: p.id as string,
      saldo: Number(p.qtd_estoque) || 0,
      id_usuario: idUsuario,
      observacao: textoHistoricoPrecoVenda({
        anterior: vendaAntes,
        posterior: vendaNova,
        percentual,
        lote: true,
      }),
    });
    atualizados += 1;
  }

  return NextResponse.json({ ok: true, atualizados });
}
