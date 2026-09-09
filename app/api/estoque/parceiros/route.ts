import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { idsEmpresasParceirosVisiveis } from "@/lib/estoque/empresas-parceiros-compartilhados";
import { erroUnicoDocParceiro, parseParceiroBody, tabelaParceiro } from "@/lib/estoque/parceiro-campos";
import type { ParceiroEstoqueRow } from "@/lib/estoque/parceiro-campos";
import { empresaIdDaSessao, parseEmpresaIdValor } from "@/lib/estoque/parse-empresa-id";

function preferirParceiroDaEmpresa(
  rows: ParceiroEstoqueRow[],
  idEmpresa: number,
): ParceiroEstoqueRow[] {
  const byDoc = new Map<string, ParceiroEstoqueRow>();
  for (const row of rows) {
    const prev = byDoc.get(row.doc);
    if (!prev) {
      byDoc.set(row.doc, row);
      continue;
    }
    if (row.id_empresa === idEmpresa && prev.id_empresa !== idEmpresa) {
      byDoc.set(row.doc, row);
    }
  }
  return [...byDoc.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

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
  let idsEscopo: number[];
  try {
    idsEscopo = await idsEmpresasParceirosVisiveis(supabase, empresaId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao resolver empresas.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let query = supabase.from(tabela).select("*").in("id_empresa", idsEscopo).order("nome", {
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

  const rows = preferirParceiroDaEmpresa((data ?? []) as ParceiroEstoqueRow[], empresaId);
  return NextResponse.json({ data: rows });
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
  let idsEscopo: number[];
  try {
    idsEscopo = await idsEmpresasParceirosVisiveis(supabase, empresaId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao resolver empresas.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (parsed.data.doc) {
    const { data: existentes, error: dupErr } = await supabase
      .from(tabela)
      .select("id")
      .in("id_empresa", idsEscopo)
      .eq("doc", parsed.data.doc)
      .limit(1);
    if (dupErr) {
      return NextResponse.json({ error: dupErr.message }, { status: 500 });
    }
    if (existentes && existentes.length > 0) {
      return NextResponse.json(
        { error: "Já existe um cadastro com este CPF/CNPJ." },
        { status: 409 },
      );
    }
  }

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
