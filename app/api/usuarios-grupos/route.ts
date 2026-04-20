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
    .from("usuarios_grupos")
    .select(
      "id, grupo_usuarios, data_atualizacao, ativo, calendario, agenda_apenas_coluna_propria",
    )
    .order("grupo_usuarios", { ascending: true });

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
    grupo_usuarios?: string;
    calendario?: boolean;
    agenda_apenas_coluna_propria?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const nome = body.grupo_usuarios?.trim();
  if (!nome) {
    return NextResponse.json(
      { error: "Informe o nome do grupo." },
      { status: 400 },
    );
  }
  const calendario =
    typeof body.calendario === "boolean" ? body.calendario : false;
  const agendaApenasColunaPropria =
    typeof body.agenda_apenas_coluna_propria === "boolean"
      ? body.agenda_apenas_coluna_propria
      : false;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("usuarios_grupos")
    .insert({
      grupo_usuarios: nome,
      calendario,
      agenda_apenas_coluna_propria: agendaApenasColunaPropria,
    })
    .select(
      "id, grupo_usuarios, data_atualizacao, ativo, calendario, agenda_apenas_coluna_propria",
    )
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
