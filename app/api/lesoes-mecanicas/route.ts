import { NextResponse } from "next/server";
import { CATALOGO_AVALIACOES, parseBooleanQueryParam, sanitizeTextoCatalogo } from "@/lib/avaliacoes/catalogos";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const CFG = CATALOGO_AVALIACOES.lesoes_mecanicas;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const incluirInativos = parseBooleanQueryParam(new URL(request.url).searchParams.get("incluir_inativos"));
  const supabase = createAdminClient();
  let query = supabase.from(CFG.table).select(`id, ${CFG.textColumn}, ativo, data`);
  if (!incluirInativos) query = query.eq("ativo", true);
  const { data, error } = await query.order(CFG.textColumn, { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { tipo?: unknown };
  const texto = sanitizeTextoCatalogo(body.tipo);
  if (!texto) return NextResponse.json({ error: "Informe o tipo." }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from(CFG.table).insert({ [CFG.textColumn]: texto, ativo: true }).select(`id, ${CFG.textColumn}, ativo, data`).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
