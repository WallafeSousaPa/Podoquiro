import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { erroUnicoDocParceiro, parseParceiroBody, tabelaParceiro } from "@/lib/estoque/parceiro-campos";
import { empresaIdDaSessao, parseEmpresaIdValor } from "@/lib/estoque/parse-empresa-id";

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
  const tabela = tabelaParceiro(searchParams.get("papel"));
  if (!tabela) {
    return NextResponse.json(
      { error: "Informe papel=fornecedor ou papel=comprador." },
      { status: 400 },
    );
  }

  const empresaId = parseEmpresaIdValor(searchParams.get("id_empresa")) ?? sessionEmpresaId;
  const supabase = createAdminClient();

  let query = supabase.from(tabela).select("*").eq("id_empresa", empresaId).order("nome", {
    ascending: true,
  });

  const q = searchParams.get("q")?.trim();
  if (q) {
    const nome = q.replace(/[%_,()]/g, "").slice(0, 80);
    const doc = q.replace(/\D/g, "").slice(0, 14);
    if (nome && doc) {
      query = query.or(`nome.ilike.%${nome}%,doc.ilike.%${doc}%`);
    } else if (nome) {
      query = query.ilike("nome", `%${nome}%`);
    } else if (doc) {
      query = query.ilike("doc", `%${doc}%`);
    }
  }

  const status = searchParams.get("status");
  if (status === "ativo") query = query.eq("ativo", true);
  else if (status === "inativo") query = query.eq("ativo", false);

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const tabela = tabelaParceiro(body.papel);
  if (!tabela) {
    return NextResponse.json(
      { error: "Informe papel=fornecedor ou papel=comprador." },
      { status: 400 },
    );
  }

  const empresaId = parseEmpresaIdValor(body.id_empresa) ?? sessionEmpresaId;
  const parsed = parseParceiroBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(tabela)
    .insert({
      id_empresa: empresaId,
      ...parsed.data,
    })
    .select("*")
    .single();

  if (error) {
    const unico = erroUnicoDocParceiro(error.message);
    return NextResponse.json({ error: unico ?? error.message }, { status: unico ? 409 : 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
