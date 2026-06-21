import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function normalizarCodigoBandeira(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 0 || d.length > 2) return null;
  return d.padStart(2, "0").slice(0, 2);
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bandeiras")
    .select("id, codigo, nome_bandeira, ativo")
    .order("codigo", { ascending: true });

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

  let body: { codigo?: unknown; nome_bandeira?: unknown; ativo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const codigoRaw = typeof body.codigo === "string" ? body.codigo.trim() : "";
  const codigo = normalizarCodigoBandeira(codigoRaw);
  if (!codigo) {
    return NextResponse.json(
      { error: "Informe o código da bandeira (2 dígitos, ex.: 01, 99)." },
      { status: 400 },
    );
  }

  const nome_bandeira =
    typeof body.nome_bandeira === "string" ? body.nome_bandeira.trim() : "";
  if (!nome_bandeira) {
    return NextResponse.json(
      { error: "Informe o nome da bandeira." },
      { status: 400 },
    );
  }

  const ativo = typeof body.ativo === "boolean" ? body.ativo : true;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bandeiras")
    .insert({ codigo, nome_bandeira, ativo })
    .select("id, codigo, nome_bandeira, ativo")
    .single();

  if (error) {
    console.error(error);
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Já existe bandeira com esse código ou nome." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
