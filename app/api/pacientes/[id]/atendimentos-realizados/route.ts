import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nomeProfissionalEmbed(
  u: { nome_completo?: string | null; usuario?: string | null } | null,
): string {
  if (!u) return "Profissional";
  const nc = u.nome_completo?.trim();
  if (nc) return nc;
  return u.usuario?.trim() || "Profissional";
}

export async function GET(_request: Request, context: RouteContext) {
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

  const { data: rows, error: aErr } = await supabase
    .from("agendamentos")
    .select(
      `
      id,
      status,
      data_hora_inicio,
      data_hora_fim,
      valor_bruto,
      desconto,
      valor_total,
      observacoes,
      usuarios ( nome_completo, usuario ),
      salas ( nome_sala ),
      agendamento_procedimentos (
        valor_aplicado,
        procedimentos ( procedimento )
      ),
      agendamento_produtos (
        qtd,
        produtos ( produto )
      )
    `,
    )
    .eq("id_paciente", idPaciente)
    .eq("id_empresa", empresaId)
    .order("data_hora_inicio", { ascending: false })
    .limit(300);

  if (aErr) {
    console.error(aErr);
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }

  const data = (rows ?? []).map((r) => {
    const uRaw = r.usuarios as
      | { nome_completo?: string | null; usuario?: string | null }
      | { nome_completo?: string | null; usuario?: string | null }[]
      | null;
    const u0 = Array.isArray(uRaw) ? uRaw[0] : uRaw;

    const sRaw = r.salas as { nome_sala?: string } | { nome_sala?: string }[] | null;
    const s0 = Array.isArray(sRaw) ? sRaw[0] : sRaw;

    const procs = (r.agendamento_procedimentos ?? []) as {
      valor_aplicado: number | string;
      procedimentos:
        | { procedimento?: string }
        | { procedimento?: string }[]
        | null;
    }[];

    const procedimentos = procs.map((p) => {
      const pr = p.procedimentos;
      const p0 = Array.isArray(pr) ? pr[0] : pr;
      return {
        nome: p0?.procedimento?.trim() ?? "Procedimento",
        valor_aplicado: Number(p.valor_aplicado),
      };
    });

    const aprods = (r.agendamento_produtos ?? []) as {
      qtd: number | string;
      produtos: { produto?: string } | { produto?: string }[] | null;
    }[];

    const produtos = aprods.map((ap) => {
      const pr = ap.produtos;
      const p0 = Array.isArray(pr) ? pr[0] : pr;
      return {
        nome: p0?.produto?.trim() ?? "Produto",
        qtd: Number(ap.qtd),
      };
    });

    return {
      id: r.id as number,
      status: String(r.status ?? "pendente"),
      data_hora_inicio: String(r.data_hora_inicio),
      data_hora_fim: String(r.data_hora_fim),
      valor_bruto: Number(r.valor_bruto),
      desconto: Number(r.desconto),
      valor_total: Number(r.valor_total),
      observacoes: typeof r.observacoes === "string" ? r.observacoes.trim() || null : null,
      profissional_nome: nomeProfissionalEmbed(u0),
      sala_nome: s0?.nome_sala?.trim() || "Sala",
      procedimentos,
      produtos,
    };
  });

  return NextResponse.json({ data });
}
