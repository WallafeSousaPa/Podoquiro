import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { normalizarCnpj14 } from "@/lib/documentos/cnpj";
import { createAdminClient } from "@/lib/supabase/admin";

function parseCnpjBody(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const n = normalizarCnpj14(raw);
  if (!n) throw new Error("CNPJ inválido. Informe 14 dígitos.");
  return n;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("maquinetas")
    .select("id, nome, cnpj, ativo")
    .order("nome", { ascending: true });

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

  let body: { nome?: unknown; cnpj?: unknown; ativo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) {
    return NextResponse.json(
      { error: "Informe o nome da maquineta." },
      { status: 400 },
    );
  }

  let cnpj: string | null = null;
  try {
    const parsed = parseCnpjBody(body.cnpj);
    if (parsed !== undefined) cnpj = parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "CNPJ inválido.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const ativo = typeof body.ativo === "boolean" ? body.ativo : true;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("maquinetas")
    .insert({ nome, cnpj, ativo })
    .select("id, nome, cnpj, ativo")
    .single();

  if (error) {
    console.error(error);
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Já existe uma maquineta com esse nome." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
