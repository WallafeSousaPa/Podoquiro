import { NextResponse } from "next/server";
import { diasEntreAnamnesesDoValorDb } from "@/lib/avaliacoes/anamnese-intervalo";
import { getSession } from "@/lib/auth/session";
import { getUsuarioPodeRelatorioCaixa } from "@/lib/dashboard/menu-grupo";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }
  const idUsuario = Number(session.sub);
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const podeEditar = await getUsuarioPodeRelatorioCaixa(supabase, idUsuario);
  const { data, error } = await supabase
    .from("empresas")
    .select("dias_entre_anamneses")
    .eq("id", empresaId)
    .maybeSingle();
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const raw = data?.dias_entre_anamneses ?? null;
  return NextResponse.json({
    pode_editar: podeEditar,
    dias_entre_anamneses:
      raw == null ? null : diasEntreAnamnesesDoValorDb(raw),
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }
  const idUsuario = Number(session.sub);
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  let body: { dias_entre_anamneses?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const podeEditar = await getUsuarioPodeRelatorioCaixa(supabase, idUsuario);
  if (!podeEditar) {
    return NextResponse.json(
      { error: "Somente usuários dos grupos Administrador ou Administrativo podem alterar este parâmetro." },
      { status: 403 },
    );
  }

  let valorDb: number | null;
  if (body.dias_entre_anamneses === null || typeof body.dias_entre_anamneses === "undefined") {
    valorDb = null;
  } else {
    const n = Number(body.dias_entre_anamneses);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: "Informe um número válido ou deixe vazio para desativar." }, { status: 400 });
    }
    const i = Math.trunc(n);
    if (i <= 0) {
      return NextResponse.json(
        { error: "O intervalo deve ser de pelo menos 1 dia ou use desativado (vazio)." },
        { status: 400 },
      );
    }
    if (i > 3650) {
      return NextResponse.json({ error: "Intervalo máximo permitido: 3650 dias." }, { status: 400 });
    }
    valorDb = i;
  }

  const { data, error } = await supabase
    .from("empresas")
    .update({ dias_entre_anamneses: valorDb })
    .eq("id", empresaId)
    .select("dias_entre_anamneses")
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const rawAtual = data.dias_entre_anamneses ?? null;
  return NextResponse.json({
    dias_entre_anamneses:
      rawAtual == null ? null : diasEntreAnamnesesDoValorDb(rawAtual),
  });
}
