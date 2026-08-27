import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUsuarioPodeMenuPonto } from "@/lib/dashboard/menu-grupo";
import {
  criarTratamentoPonto,
  datetimeLocalParaIsoBr,
  ehTipoTratamentoPonto,
} from "@/lib/ponto/tratamentos";
import { createAdminClient } from "@/lib/supabase/admin";

function parseId(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseId(session.idEmpresa);
  const usuarioId = parseId(session.sub);
  if (!empresaId || !usuarioId) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const pode = await getUsuarioPodeMenuPonto(supabase, usuarioId);
  if (!pode) {
    return NextResponse.json(
      { error: "Sem permissão para ajustar o ponto." },
      { status: 403 },
    );
  }

  let body: {
    tipo?: unknown;
    funcionario_id?: unknown;
    nsr?: unknown;
    data_hora?: unknown;
    motivo?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const tipoRaw = typeof body.tipo === "string" ? body.tipo.trim() : "";
  if (!ehTipoTratamentoPonto(tipoRaw)) {
    return NextResponse.json(
      { error: "Tipo de ajuste inválido." },
      { status: 400 },
    );
  }

  const funcionarioId = parseId(body.funcionario_id);
  if (!funcionarioId) {
    return NextResponse.json(
      { error: "Selecione o funcionário." },
      { status: 400 },
    );
  }

  const nsr = parseId(body.nsr);
  const dataHoraRaw = typeof body.data_hora === "string" ? body.data_hora.trim() : "";
  let dataHoraNovaIso: string | null = null;
  if (dataHoraRaw) {
    dataHoraNovaIso = datetimeLocalParaIsoBr(dataHoraRaw);
    if (!dataHoraNovaIso) {
      return NextResponse.json(
        { error: "Data e hora do ajuste inválidas." },
        { status: 400 },
      );
    }
  }

  const motivo = typeof body.motivo === "string" ? body.motivo : "";

  try {
    const { tratamento } = await criarTratamentoPonto(supabase, {
      empresaId,
      usuarioId,
      tipo: tipoRaw,
      funcionarioId,
      motivo,
      nsrReferencia: nsr,
      dataHoraNovaIso,
    });
    return NextResponse.json({ ok: true, tratamento });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Não foi possível gravar o ajuste.";
    const status =
      msg === "Funcionário não encontrado." ||
      msg === "Marcação original não encontrada."
        ? 404
        : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
