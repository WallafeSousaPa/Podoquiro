import { NextResponse } from "next/server";
import { getPodeVerTodosAgendamentos } from "@/lib/agenda/permissoes-calendario";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNfseNoCaixa } from "@/lib/dashboard/nota-fiscal-permissao";
import { carregarNotaFiscalAtendimentosRows } from "@/lib/financeiro/nota-fiscal-atendimentos-rows";
import { validarPeriodoRelatorio } from "@/lib/relatorios/periodo";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const session = await getSession();
  const negado = await respostaSeSemPermissaoNfseNoCaixa(session);
  if (negado) return negado;

  const empresaId = Number(session!.idEmpresa);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session!.sub);
  if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const dataInicio = searchParams.get("data_inicio")?.trim() ?? "";
  const dataFim = searchParams.get("data_fim")?.trim() ?? "";
  const paciente = searchParams.get("paciente")?.trim() ?? "";

  const erroPeriodo = validarPeriodoRelatorio(dataInicio, dataFim);
  if (erroPeriodo) {
    return NextResponse.json({ error: erroPeriodo }, { status: 400 });
  }

  if (paciente.length > 0 && paciente.length < 2) {
    return NextResponse.json(
      { error: "Informe ao menos 2 caracteres no nome do paciente." },
      { status: 400 },
    );
  }

  try {
    const supabase = createAdminClient();
    const podeVerTodos = await getPodeVerTodosAgendamentos(
      supabase,
      sessionUserId,
    );
    const rows = await carregarNotaFiscalAtendimentosRows(supabase, {
      empresaId,
      sessionUserId,
      podeVerTodosAgendamentos: podeVerTodos,
      dataInicio,
      dataFim,
      pacienteBusca: paciente,
    });
    return NextResponse.json({
      rows,
      periodo: { data_inicio: dataInicio, data_fim: dataFim },
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Não foi possível carregar os atendimentos.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
