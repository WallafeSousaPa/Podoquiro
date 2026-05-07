import { NextResponse } from "next/server";
import { CATALOGO_AVALIACOES, sanitizeTextoCatalogo } from "@/lib/avaliacoes/catalogos";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const CFG = CATALOGO_AVALIACOES.formato_dedos;
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { tipo?: unknown; ativo?: unknown };
  const patch: Record<string, unknown> = {};
  if (typeof body.ativo === "boolean") patch.ativo = body.ativo;
  if (typeof body.tipo !== "undefined") {
    const texto = sanitizeTextoCatalogo(body.tipo);
    if (!texto) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
    patch[CFG.textColumn] = texto;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase.from(CFG.table).update(patch).eq("id", id).select(`id, ${CFG.textColumn}, ativo, data`).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  return NextResponse.json({ data });
}
