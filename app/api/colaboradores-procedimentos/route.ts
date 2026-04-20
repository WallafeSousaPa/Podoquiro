import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseComissao(v: unknown): number | null {
  if (v === null || typeof v === "undefined") return null;
  if (typeof v === "number") {
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
  }
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  }
  return null;
}

/** Lista vínculos de um colaborador (query: id_usuario). */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const idUsuario = Number(
    new URL(request.url).searchParams.get("id_usuario") ?? "",
  );
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
    return NextResponse.json(
      { error: "Informe id_usuario na query." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
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

  const { data, error } = await supabase
    .from("colaboradores_procedimentos")
    .select(
      `
      id,
      id_usuario,
      id_procedimento,
      comissao_porcentagem,
      ultima_atualizacao,
      procedimentos ( id, procedimento, valor_total, ativo )
    `,
    )
    .eq("id_usuario", idUsuario)
    .order("id", { ascending: true });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((raw) => {
    const pr = raw.procedimentos as
      | {
          id: number;
          procedimento: string;
          valor_total: number;
          ativo: boolean;
        }
      | {
          id: number;
          procedimento: string;
          valor_total: number;
          ativo: boolean;
        }[]
      | null;
    const p0 = Array.isArray(pr) ? pr[0] : pr;
    return {
      id: raw.id as number,
      id_usuario: raw.id_usuario as number,
      id_procedimento: raw.id_procedimento as number,
      comissao_porcentagem:
        raw.comissao_porcentagem === null
          ? null
          : Number(raw.comissao_porcentagem),
      ultima_atualizacao: raw.ultima_atualizacao as string,
      procedimento_nome: p0?.procedimento ?? null,
      procedimento_valor_total: p0 != null ? Number(p0.valor_total) : null,
      procedimento_ativo: p0?.ativo ?? null,
    };
  });

  return NextResponse.json({ data: rows });
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
    id_usuario?: unknown;
    id_procedimento?: unknown;
    comissao_porcentagem?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const idUsuario = Number(body.id_usuario);
  const idProcedimento = Number(body.id_procedimento);
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
    return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
  }
  if (!Number.isFinite(idProcedimento) || idProcedimento <= 0) {
    return NextResponse.json({ error: "Procedimento inválido." }, { status: 400 });
  }

  const comissao = parseComissao(body.comissao_porcentagem);
  if (body.comissao_porcentagem !== undefined && body.comissao_porcentagem !== null && comissao === null) {
    return NextResponse.json(
      { error: "Comissão deve ser entre 0 e 100% ou vazio." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

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

  const { data: pRow, error: pErr } = await supabase
    .from("procedimentos")
    .select("id, id_empresa")
    .eq("id", idProcedimento)
    .maybeSingle();
  if (pErr) {
    console.error(pErr);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  if (!pRow || (pRow.id_empresa as number) !== empresaId) {
    return NextResponse.json({ error: "Procedimento inválido." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("colaboradores_procedimentos")
    .insert({
      id_usuario: idUsuario,
      id_procedimento: idProcedimento,
      comissao_porcentagem: comissao,
    })
    .select(
      "id, id_usuario, id_procedimento, comissao_porcentagem, ultima_atualizacao",
    )
    .single();

  if (error) {
    console.error(error);
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Este procedimento já está vinculado ao colaborador." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
