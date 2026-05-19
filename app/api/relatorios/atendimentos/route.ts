import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUsuarioPodeRelatorioCaixa } from "@/lib/dashboard/menu-grupo";
import {
  gerarRelatorioAtendimentos,
  parseStatusFiltroRelatorioAtendimentos,
} from "@/lib/relatorios/atendimentos";
import { validarPeriodoRelatorio } from "@/lib/relatorios/periodo";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
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

  const sessionUserId = Number(session.sub);
  if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const pode = await getUsuarioPodeRelatorioCaixa(supabase, sessionUserId);
  if (!pode) {
    return NextResponse.json(
      { error: "Sem permissão para consultar relatórios de atendimentos." },
      { status: 403 },
    );
  }

  const sp = new URL(request.url).searchParams;
  const dataInicio = sp.get("data_inicio")?.trim() ?? "";
  const dataFim = sp.get("data_fim")?.trim() ?? "";
  const statusFiltro = parseStatusFiltroRelatorioAtendimentos(sp.get("status"));

  const erroPeriodo = validarPeriodoRelatorio(dataInicio, dataFim);
  if (erroPeriodo) {
    return NextResponse.json({ error: erroPeriodo }, { status: 400 });
  }

  try {
    const data = await gerarRelatorioAtendimentos(supabase, {
      idEmpresa: empresaId,
      dataInicio,
      dataFim,
      statusFiltro,
    });
    return NextResponse.json({ data });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao gerar relatório." },
      { status: 500 },
    );
  }
}
