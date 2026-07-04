import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUsuarioPodeRelatorioCaixa } from "@/lib/dashboard/menu-grupo";
import {
  gerarRelatorioComparativo,
  validarParametrosComparativo,
} from "@/lib/relatorios/comparativo";
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
      { error: "Sem permissão para consultar relatórios comparativos." },
      { status: 403 },
    );
  }

  const sp = new URL(request.url).searchParams;
  const validacao = validarParametrosComparativo({
    granularidade: sp.get("granularidade") ?? "",
    periodo_a: sp.get("periodo_a") ?? "",
    periodo_b: sp.get("periodo_b") ?? "",
  });

  if (!validacao.ok) {
    return NextResponse.json({ error: validacao.error }, { status: 400 });
  }

  try {
    const data = await gerarRelatorioComparativo(supabase, {
      idEmpresa: empresaId,
      granularidade: validacao.granularidade,
      periodoA: validacao.a,
      periodoB: validacao.b,
    });
    return NextResponse.json({ data });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao gerar comparativo." },
      { status: 500 },
    );
  }
}
