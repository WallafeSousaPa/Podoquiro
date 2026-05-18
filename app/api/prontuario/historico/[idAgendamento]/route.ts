import { NextResponse } from "next/server";
import { getUsuarioPodeAcessarProntuarioAtendimento } from "@/lib/agenda/permissoes-calendario";
import { carregarDetalheHistoricoProntuario } from "@/lib/prontuario/historico-atendimentos";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type RouteContext = { params: Promise<{ idAgendamento: string }> };

/** Detalhe de um atendimento do histórico (fotos com URL assinada). */
export async function GET(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const { idAgendamento: idParam } = await context.params;
  const idAgendamentoHistorico = Number(idParam);
  if (!Number.isFinite(idAgendamentoHistorico) || idAgendamentoHistorico <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const url = new URL(request.url);
  const idAtual = Number(url.searchParams.get("id_agendamento_atual"));
  if (!Number.isFinite(idAtual) || idAtual <= 0) {
    return NextResponse.json(
      { error: "Informe id_agendamento_atual na consulta." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: agAtual, error: agAtualErr } = await supabase
    .from("agendamentos")
    .select("id, id_empresa, id_usuario, id_paciente, status")
    .eq("id", idAtual)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (agAtualErr) {
    console.error(agAtualErr);
    return NextResponse.json({ error: agAtualErr.message }, { status: 500 });
  }
  if (!agAtual) {
    return NextResponse.json({ error: "Agendamento atual não encontrado." }, { status: 404 });
  }
  if (String(agAtual.status) !== "em_andamento") {
    return NextResponse.json(
      { error: "O prontuário só pode ser consultado com status Em andamento." },
      { status: 400 },
    );
  }

  const podeProntuario = await getUsuarioPodeAcessarProntuarioAtendimento(
    supabase,
    sessionUserId,
    agAtual.id_usuario as number,
  );
  if (!podeProntuario) {
    return NextResponse.json(
      { error: "Sem permissão para acessar o prontuário deste atendimento." },
      { status: 403 },
    );
  }

  const idPaciente = agAtual.id_paciente as number;

  try {
    const detalhe = await carregarDetalheHistoricoProntuario(supabase, {
      idEmpresa: empresaId,
      idAgendamento: idAgendamentoHistorico,
      idPaciente,
    });
    if (!detalhe) {
      return NextResponse.json(
        { error: "Atendimento do histórico não encontrado." },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: detalhe });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao carregar histórico." },
      { status: 500 },
    );
  }
}
