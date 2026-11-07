import { NextResponse } from "next/server";
import { diasEntreAnamnesesDoValorDb } from "@/lib/avaliacoes/anamnese-intervalo";
import { getSession } from "@/lib/auth/session";
import { getUsuarioGrupoAdministrativo } from "@/lib/dashboard/menu-grupo";
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
  const podeEditar = await getUsuarioGrupoAdministrativo(supabase, idUsuario);
  const { data, error } = await supabase
    .from("empresas")
    .select("dias_entre_anamneses, dias_entre_anamneses_enfermagem")
    .eq("id", empresaId)
    .maybeSingle();
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const raw = data?.dias_entre_anamneses ?? null;
  const rawEnf = data?.dias_entre_anamneses_enfermagem ?? null;
  return NextResponse.json({
    pode_editar: podeEditar,
    dias_entre_anamneses: raw == null ? null : diasEntreAnamnesesDoValorDb(raw),
    dias_entre_anamneses_enfermagem:
      rawEnf == null ? null : diasEntreAnamnesesDoValorDb(rawEnf),
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

  let body: {
    dias_entre_anamneses?: number | null;
    dias_entre_anamneses_enfermagem?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const podeEditar = await getUsuarioGrupoAdministrativo(supabase, idUsuario);
  if (!podeEditar) {
    return NextResponse.json(
      { error: "Somente usuários dos grupos Administrador ou Diretoria podem alterar este parâmetro." },
      { status: 403 },
    );
  }

  function lerDias(valor: number | null | undefined, rotulo: string): number | null | NextResponse {
    if (valor === null || typeof valor === "undefined") return null;
    const n = Number(valor);
    if (!Number.isFinite(n)) {
      return NextResponse.json(
        { error: `${rotulo}: informe um número válido ou deixe vazio para desativar.` },
        { status: 400 },
      );
    }
    const i = Math.trunc(n);
    if (i <= 0) {
      return NextResponse.json(
        { error: `${rotulo}: o intervalo deve ser de pelo menos 1 dia ou use desativado (vazio).` },
        { status: 400 },
      );
    }
    if (i > 3650) {
      return NextResponse.json(
        { error: `${rotulo}: intervalo máximo permitido é 3650 dias.` },
        { status: 400 },
      );
    }
    return i;
  }

  const diasPodologo = lerDias(body.dias_entre_anamneses, "Podólogo");
  if (diasPodologo instanceof NextResponse) return diasPodologo;
  const diasEnfermagem = lerDias(body.dias_entre_anamneses_enfermagem, "Enfermagem");
  if (diasEnfermagem instanceof NextResponse) return diasEnfermagem;

  const { data, error } = await supabase
    .from("empresas")
    .update({
      dias_entre_anamneses: diasPodologo,
      dias_entre_anamneses_enfermagem: diasEnfermagem,
    })
    .eq("id", empresaId)
    .select("dias_entre_anamneses, dias_entre_anamneses_enfermagem")
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const rawAtual = data.dias_entre_anamneses ?? null;
  const rawEnf = data.dias_entre_anamneses_enfermagem ?? null;
  return NextResponse.json({
    dias_entre_anamneses: rawAtual == null ? null : diasEntreAnamnesesDoValorDb(rawAtual),
    dias_entre_anamneses_enfermagem: rawEnf == null ? null : diasEntreAnamnesesDoValorDb(rawEnf),
  });
}
