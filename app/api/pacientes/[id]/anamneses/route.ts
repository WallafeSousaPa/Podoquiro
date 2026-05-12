import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nomeResponsavelEmbed(
  u: { nome_completo?: string | null; usuario?: string | null } | null,
): string {
  if (!u) return "Profissional";
  const nc = u.nome_completo?.trim();
  if (nc) return nc;
  return u.usuario?.trim() || "Profissional";
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { id: idParam } = await context.params;
  const idPaciente = Number(idParam);
  if (!Number.isFinite(idPaciente) || idPaciente <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const url = new URL(request.url);
  const somenteAtivos = url.searchParams.get("incluir_inativos") !== "1";

  const supabase = createAdminClient();

  const { data: paciente, error: pErr } = await supabase
    .from("pacientes")
    .select("id")
    .eq("id", idPaciente)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (pErr) {
    console.error(pErr);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  if (!paciente) {
    return NextResponse.json({ error: "Paciente não encontrado." }, { status: 404 });
  }

  let query = supabase
    .from("pacientes_evolucao")
    .select(
      `
      id,
      data,
      ativo,
      observacao,
      tratamento_sugerido,
      forma_contato,
      pressao_arterial,
      glicemia,
      usuarios ( nome_completo, usuario ),
      condicoes_saude ( condicao )
    `,
    )
    .eq("id_paciente", idPaciente)
    .order("data", { ascending: false })
    .limit(200);

  if (somenteAtivos) {
    query = query.eq("ativo", true);
  }

  const { data: rows, error: evErr } = await query;

  if (evErr) {
    console.error(evErr);
    return NextResponse.json({ error: evErr.message }, { status: 500 });
  }

  const data = (rows ?? []).map((r) => {
    const uRaw = r.usuarios as
      | { nome_completo?: string | null; usuario?: string | null }
      | { nome_completo?: string | null; usuario?: string | null }[]
      | null;
    const u0 = Array.isArray(uRaw) ? uRaw[0] : uRaw;

    const cRaw = r.condicoes_saude as
      | { condicao?: string }
      | { condicao?: string }[]
      | null;
    const c0 = Array.isArray(cRaw) ? cRaw[0] : cRaw;

    return {
      id: r.id as number,
      data: String(r.data),
      ativo: Boolean(r.ativo),
      observacao: typeof r.observacao === "string" ? r.observacao.trim() || null : null,
      tratamento_sugerido:
        typeof r.tratamento_sugerido === "string" ? r.tratamento_sugerido.trim() || null : null,
      forma_contato: r.forma_contato != null ? String(r.forma_contato) : null,
      pressao_arterial:
        typeof r.pressao_arterial === "string" ? r.pressao_arterial.trim() || null : null,
      glicemia: typeof r.glicemia === "string" ? r.glicemia.trim() || null : null,
      responsavel_nome: nomeResponsavelEmbed(u0),
      condicao_nome: c0?.condicao?.trim() ?? null,
    };
  });

  return NextResponse.json({ data });
}
