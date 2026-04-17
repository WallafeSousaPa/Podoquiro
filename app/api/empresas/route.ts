import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("empresas")
    .select(
      "id, nome_fantasia, razao_social, cnpj_cpf, cep, endereco, numero, complemento, bairro, cidade, estado, id_empresa_grupo, ativo, empresa_grupos:empresa_grupos!empresas_id_empresa_grupo_fkey(id, grupo_empresa)",
    )
    .order("nome_fantasia", { ascending: true });

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

  let body: {
    nome_fantasia?: string;
    razao_social?: string;
    cnpj_cpf?: string;
    cep?: string | null;
    endereco?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
    id_empresa_grupo?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const nome_fantasia = body.nome_fantasia?.trim();
  const razao_social = body.razao_social?.trim();
  const cnpj_cpf = body.cnpj_cpf?.trim();
  const id_empresa_grupo = Number(body.id_empresa_grupo);

  if (!nome_fantasia) {
    return NextResponse.json(
      { error: "Informe o nome fantasia." },
      { status: 400 },
    );
  }
  if (!razao_social) {
    return NextResponse.json(
      { error: "Informe a razão social." },
      { status: 400 },
    );
  }
  if (!cnpj_cpf) {
    return NextResponse.json(
      { error: "Informe o CPF/CNPJ." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(id_empresa_grupo) || id_empresa_grupo <= 0) {
    return NextResponse.json(
      { error: "Selecione um grupo de empresas." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: grupoAtivo, error: grupoError } = await supabase
    .from("empresa_grupos")
    .select("id")
    .eq("id", id_empresa_grupo)
    .eq("ativo", true)
    .maybeSingle();
  if (grupoError) {
    console.error(grupoError);
    return NextResponse.json({ error: grupoError.message }, { status: 500 });
  }
  if (!grupoAtivo) {
    return NextResponse.json(
      { error: "Grupo de empresas inválido ou inativo." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("empresas")
    .insert({
      nome_fantasia,
      razao_social,
      cnpj_cpf,
      cep: body.cep?.trim() || null,
      endereco: body.endereco?.trim() || null,
      numero: body.numero?.trim() || null,
      complemento: body.complemento?.trim() || null,
      bairro: body.bairro?.trim() || null,
      cidade: body.cidade?.trim() || null,
      estado: body.estado?.trim() || null,
      id_empresa_grupo,
      ativo: true,
    })
    .select(
      "id, nome_fantasia, razao_social, cnpj_cpf, cep, endereco, numero, complemento, bairro, cidade, estado, id_empresa_grupo, ativo",
    )
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
