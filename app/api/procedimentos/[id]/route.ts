import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseMoney(v: unknown): number | null | undefined {
  if (typeof v === "undefined") return undefined;
  if (v === null) return null;
  if (typeof v === "number") {
    return Number.isFinite(v) && v >= 0 ? v : null;
  }
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

function parsePercent(v: unknown): number | null | undefined {
  if (typeof v === "undefined") return undefined;
  if (v === null) return null;
  if (typeof v === "number") {
    return Number.isFinite(v) && v >= 0 ? v : null;
  }
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return 0;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: {
    procedimento?: string;
    custo_base?: unknown;
    margem_lucro?: unknown;
    taxas_impostos?: unknown;
    ativo?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existe, error: checkErr } = await supabase
    .from("procedimentos")
    .select("id")
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (checkErr) {
    console.error(checkErr);
    return NextResponse.json({ error: checkErr.message }, { status: 500 });
  }
  if (!existe) {
    return NextResponse.json({ error: "Procedimento não encontrado." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.procedimento !== "undefined") {
    if (typeof body.procedimento !== "string" || !body.procedimento.trim()) {
      return NextResponse.json(
        { error: "Nome do procedimento inválido." },
        { status: 400 },
      );
    }
    patch.procedimento = body.procedimento.trim();
  }

  if (typeof body.custo_base !== "undefined") {
    const c = parseMoney(body.custo_base);
    if (c === null || c === undefined) {
      return NextResponse.json(
        { error: "Custo base inválido (≥ 0)." },
        { status: 400 },
      );
    }
    patch.custo_base = c;
  }

  if (typeof body.margem_lucro !== "undefined") {
    const m = parsePercent(body.margem_lucro);
    if (m === null) {
      return NextResponse.json(
        { error: "Margem de lucro inválida (≥ 0)." },
        { status: 400 },
      );
    }
    patch.margem_lucro = m;
  }

  if (typeof body.taxas_impostos !== "undefined") {
    const t = parsePercent(body.taxas_impostos);
    if (t === null) {
      return NextResponse.json(
        { error: "Taxas/impostos inválidos (≥ 0)." },
        { status: 400 },
      );
    }
    patch.taxas_impostos = t;
  }

  if (typeof body.ativo !== "undefined") {
    if (typeof body.ativo !== "boolean") {
      return NextResponse.json({ error: "Campo ativo inválido." }, { status: 400 });
    }
    patch.ativo = body.ativo;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("procedimentos")
    .update(patch)
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .select(
      "id, procedimento, custo_base, margem_lucro, taxas_impostos, valor_total, ativo, ultima_atualizacao",
    )
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
