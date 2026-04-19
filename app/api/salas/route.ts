import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

async function empresaExists(
  supabase: ReturnType<typeof createAdminClient>,
  id: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("empresas")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("salas")
    .select(
      "id, id_empresa, nome_sala, ativo, ultima_atualizacao, empresas(nome_fantasia)",
    )
    .order("id_empresa", { ascending: true })
    .order("nome_sala", { ascending: true });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((row) => {
    const empRaw = row.empresas as
      | { nome_fantasia: string }
      | { nome_fantasia: string }[]
      | null
      | undefined;
    const nomeFantasia = Array.isArray(empRaw)
      ? (empRaw[0]?.nome_fantasia ?? null)
      : (empRaw?.nome_fantasia ?? null);
    return {
      id: row.id,
      id_empresa: row.id_empresa,
      nome_sala: row.nome_sala,
      ativo: row.ativo,
      ultima_atualizacao: row.ultima_atualizacao,
      nome_fantasia: nomeFantasia,
    };
  });

  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: { id_empresa?: unknown; nome_sala?: string; ativo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const idEmpresa = Number(body.id_empresa);
  if (!Number.isFinite(idEmpresa) || idEmpresa <= 0) {
    return NextResponse.json(
      { error: "Selecione a empresa." },
      { status: 400 },
    );
  }

  const nome =
    typeof body.nome_sala === "string" ? body.nome_sala.trim() : "";
  if (!nome) {
    return NextResponse.json(
      { error: "Informe o nome da sala." },
      { status: 400 },
    );
  }

  const ativo =
    typeof body.ativo === "boolean" ? body.ativo : true;

  const supabase = createAdminClient();
  if (!(await empresaExists(supabase, idEmpresa))) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("salas")
    .insert({
      id_empresa: idEmpresa,
      nome_sala: nome,
      ativo,
    })
    .select(
      "id, id_empresa, nome_sala, ativo, ultima_atualizacao, empresas(nome_fantasia)",
    )
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const empRaw = data.empresas as
    | { nome_fantasia: string }
    | { nome_fantasia: string }[]
    | null
    | undefined;
  const nomeFantasia = Array.isArray(empRaw)
    ? (empRaw[0]?.nome_fantasia ?? null)
    : (empRaw?.nome_fantasia ?? null);
  return NextResponse.json({
    data: {
      id: data.id,
      id_empresa: data.id_empresa,
      nome_sala: data.nome_sala,
      ativo: data.ativo,
      ultima_atualizacao: data.ultima_atualizacao,
      nome_fantasia: nomeFantasia,
    },
  });
}
