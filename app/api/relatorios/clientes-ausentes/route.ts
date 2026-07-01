import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUsuarioPodeRelatorioCaixa } from "@/lib/dashboard/menu-grupo";
import {
  gerarRelatorioClientesAusentes,
  validarFiltrosClientesAusentes,
} from "@/lib/relatorios/clientes-ausentes";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function dataLocalYmdBr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
      { error: "Sem permissão para consultar este relatório." },
      { status: 403 },
    );
  }

  const sp = new URL(request.url).searchParams;
  const dataReferencia = sp.get("data_referencia")?.trim() || dataLocalYmdBr();
  const diasMinimos = Number(sp.get("dias_minimos") ?? "30");
  const ultimoAtendimentoDe = sp.get("ultimo_atendimento_de")?.trim() ?? "";
  const ultimoAtendimentoAte = sp.get("ultimo_atendimento_ate")?.trim() ?? "";
  const somenteAtivos = sp.get("somente_ativos") !== "0";
  const incluirSemAtendimento = sp.get("incluir_sem_atendimento") === "1";
  const busca = sp.get("busca")?.trim() ?? "";

  const erroFiltros = validarFiltrosClientesAusentes({
    dataReferencia,
    diasMinimos,
    ultimoAtendimentoDe,
    ultimoAtendimentoAte,
  });
  if (erroFiltros) {
    return NextResponse.json({ error: erroFiltros }, { status: 400 });
  }

  try {
    const data = await gerarRelatorioClientesAusentes(supabase, {
      idEmpresa: empresaId,
      dataReferencia,
      diasMinimos,
      ultimoAtendimentoDe: ultimoAtendimentoDe || null,
      ultimoAtendimentoAte: ultimoAtendimentoAte || null,
      somenteAtivos,
      incluirSemAtendimento,
      busca: busca || null,
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
