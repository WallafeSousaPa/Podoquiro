import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { darSaidaEstoque, type ItemSaidaInput } from "@/lib/estoque/dar-saida";
import { empresaIdDaSessao, parseEmpresaIdValor } from "@/lib/estoque/parse-empresa-id";
import { isTipoSaidaEstoque } from "@/lib/estoque/tipos-saida";

function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

const LISTA_SELECT =
  "id, id_empresa, tipo, status, data_saida, dest_nome, dest_doc, dest_tipo, valor_total, nota_venda_status, observacao, created_at, id_comprador, id_empresa_destino, id_nfe_emissao";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const sessionEmpresaId = empresaIdDaSessao(session.idEmpresa);
  if (!sessionEmpresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const empresaId = parseEmpresaIdValor(searchParams.get("id_empresa")) ?? sessionEmpresaId;
  const supabase = createAdminClient();

  let query = supabase
    .from("estoque_saidas")
    .select(LISTA_SELECT)
    .eq("id_empresa", empresaId)
    .order("created_at", { ascending: false })
    .limit(200);

  const tipo = searchParams.get("tipo");
  if (tipo && isTipoSaidaEstoque(tipo)) {
    query = query.eq("tipo", tipo);
  }

  const status = searchParams.get("status");
  if (status === "confirmada" || status === "cancelada") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!isTipoSaidaEstoque(body.tipo)) {
    return NextResponse.json(
      { error: "Tipo de saída inválido (venda, transferencia, perda ou avulso)." },
      { status: 400 },
    );
  }

  const empresaId = parseEmpresaIdValor(body.id_empresa) ?? sessionEmpresaId;
  const idComprador = isUuid(body.id_comprador) ? body.id_comprador : null;
  const idEmpresaDestino = parseEmpresaIdValor(body.id_empresa_destino);

  const rawItens = Array.isArray(body.itens) ? body.itens : [];
  const itens: ItemSaidaInput[] = [];
  for (const raw of rawItens) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (!isUuid(row.id_produto)) {
      return NextResponse.json({ error: "Item com produto inválido." }, { status: 400 });
    }
    const qtd = typeof row.qtd === "number" ? row.qtd : Number.parseInt(String(row.qtd ?? ""), 10);
    const vUn =
      typeof row.v_un === "number" ? row.v_un : Number(String(row.v_un ?? "0").replace(",", "."));
    const vDescRaw = row.v_desc ?? 0;
    const vDesc =
      typeof vDescRaw === "number" ? vDescRaw : Number(String(vDescRaw).replace(",", "."));
    if (!Number.isInteger(qtd) || qtd <= 0) {
      return NextResponse.json(
        { error: "Quantidade deve ser um inteiro maior que zero." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(vUn) || vUn < 0) {
      return NextResponse.json({ error: "Valor unitário inválido." }, { status: 400 });
    }
    if (!Number.isFinite(vDesc) || vDesc < 0) {
      return NextResponse.json({ error: "Desconto inválido." }, { status: 400 });
    }
    itens.push({ id_produto: row.id_produto, qtd, v_un: vUn, v_desc: vDesc });
  }

  const observacao =
    typeof body.observacao === "string" && body.observacao.trim()
      ? body.observacao.trim().slice(0, 500)
      : null;

  const supabase = createAdminClient();
  try {
    const { id } = await darSaidaEstoque(supabase, {
      id_empresa: empresaId,
      tipo: body.tipo,
      id_comprador: idComprador,
      id_empresa_destino: idEmpresaDestino,
      observacao,
      itens,
      id_usuario: idUsuario,
    });

    const { data, error } = await supabase
      .from("estoque_saidas")
      .select("*, itens:estoque_saida_itens(*)")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não foi possível registrar a saída.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
