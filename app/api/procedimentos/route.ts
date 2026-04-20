import { NextResponse } from "next/server";
import { idsProcedimentosLiberadosColaborador } from "@/lib/colaborador-procedimentos";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseMoney(v: unknown): number | null {
  if (v === null || typeof v === "undefined") return null;
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

function parsePercent(v: unknown): number | null {
  if (v === null || typeof v === "undefined") return 0;
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

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const idUsuarioParam = new URL(request.url).searchParams.get("id_usuario");
  const supabase = createAdminClient();

  if (idUsuarioParam != null && idUsuarioParam.trim() !== "") {
    const idUsuario = Number(idUsuarioParam);
    if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
      return NextResponse.json({ error: "id_usuario inválido." }, { status: 400 });
    }
    const { data: uRow, error: uErr } = await supabase
      .from("usuarios")
      .select("id, id_empresa")
      .eq("id", idUsuario)
      .maybeSingle();
    if (uErr) {
      console.error(uErr);
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }
    if (!uRow || (uRow.id_empresa as number) !== empresaId) {
      return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
    }

    let permitidos: Set<number>;
    try {
      permitidos = await idsProcedimentosLiberadosColaborador(
        supabase,
        idUsuario,
        empresaId,
      );
    } catch (e) {
      console.error(e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Erro ao carregar vínculos." },
        { status: 500 },
      );
    }
    if (permitidos.size === 0) {
      return NextResponse.json({ data: [] });
    }

    const { data, error } = await supabase
      .from("procedimentos")
      .select(
        "id, procedimento, custo_base, margem_lucro, taxas_impostos, valor_total, ativo, ultima_atualizacao",
      )
      .eq("id_empresa", empresaId)
      .eq("ativo", true)
      .in("id", [...permitidos])
      .order("procedimento", { ascending: true });

    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: data ?? [] });
  }

  const { data, error } = await supabase
    .from("procedimentos")
    .select(
      "id, procedimento, custo_base, margem_lucro, taxas_impostos, valor_total, ativo, ultima_atualizacao",
    )
    .eq("id_empresa", empresaId)
    .order("procedimento", { ascending: true });

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

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
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

  const nome = typeof body.procedimento === "string" ? body.procedimento.trim() : "";
  if (!nome) {
    return NextResponse.json(
      { error: "Informe o nome do procedimento." },
      { status: 400 },
    );
  }

  const custo = parseMoney(body.custo_base);
  if (custo === null) {
    return NextResponse.json(
      { error: "Informe um custo base válido (≥ 0)." },
      { status: 400 },
    );
  }

  const margem = parsePercent(body.margem_lucro);
  const taxas = parsePercent(body.taxas_impostos);
  if (margem === null || taxas === null) {
    return NextResponse.json(
      { error: "Margem e taxas devem ser números ≥ 0." },
      { status: 400 },
    );
  }

  const ativo =
    typeof body.ativo === "boolean" ? body.ativo : true;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("procedimentos")
    .insert({
      id_empresa: empresaId,
      procedimento: nome,
      custo_base: custo,
      margem_lucro: margem,
      taxas_impostos: taxas,
      ativo,
    })
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
