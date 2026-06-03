import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  normalizarHoraHHMM,
  validarExpedienteHorarios,
} from "@/lib/agenda/expediente-tempo";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const CAMPOS_EXPEDIENTE = [
  "id",
  "id_usuario",
  "horario_inicio",
  "intervalo_inicio",
  "intervalo_fim",
  "horario_fim",
  "horario_inicio_bloqueado",
  "horario_fim_bloqueado",
] as const;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("colaboradores_expedientes")
    .select(
      `${CAMPOS_EXPEDIENTE.join(", ")}, usuarios!inner ( id_empresa )`,
    )
    .eq("usuarios.id_empresa", empresaId);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((r) => ({
    id: r.id as number,
    id_usuario: r.id_usuario as number,
    horario_inicio: normalizarHoraHHMM(r.horario_inicio as string),
    intervalo_inicio: normalizarHoraHHMM(r.intervalo_inicio as string | null),
    intervalo_fim: normalizarHoraHHMM(r.intervalo_fim as string | null),
    horario_fim: normalizarHoraHHMM(r.horario_fim as string),
    horario_inicio_bloqueado: normalizarHoraHHMM(
      r.horario_inicio_bloqueado as string | null,
    ),
    horario_fim_bloqueado: normalizarHoraHHMM(
      r.horario_fim_bloqueado as string | null,
    ),
  }));

  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const idUsuario = Number(body.id_usuario);
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
    return NextResponse.json({ error: "Profissional inválido." }, { status: 400 });
  }

  const opt = (v: unknown): string | null => {
    if (v === null || typeof v === "undefined") return null;
    const t = String(v).trim();
    return t === "" ? null : t;
  };

  const horarios = {
    horario_inicio: String(body.horario_inicio ?? "").trim(),
    intervalo_inicio: opt(body.intervalo_inicio),
    intervalo_fim: opt(body.intervalo_fim),
    horario_fim: String(body.horario_fim ?? "").trim(),
    horario_inicio_bloqueado: opt(body.horario_inicio_bloqueado),
    horario_fim_bloqueado: opt(body.horario_fim_bloqueado),
  };

  const erro = validarExpedienteHorarios(horarios);
  if (erro) {
    return NextResponse.json({ error: erro }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: usuarioOk, error: uErr } = await supabase
    .from("usuarios")
    .select("id")
    .eq("id", idUsuario)
    .eq("id_empresa", empresaId)
    .maybeSingle();
  if (uErr) {
    console.error(uErr);
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }
  if (!usuarioOk) {
    return NextResponse.json({ error: "Profissional não encontrado." }, { status: 404 });
  }

  const registro = {
    id_usuario: idUsuario,
    horario_inicio: normalizarHoraHHMM(horarios.horario_inicio),
    intervalo_inicio: normalizarHoraHHMM(horarios.intervalo_inicio),
    intervalo_fim: normalizarHoraHHMM(horarios.intervalo_fim),
    horario_fim: normalizarHoraHHMM(horarios.horario_fim),
    horario_inicio_bloqueado: normalizarHoraHHMM(horarios.horario_inicio_bloqueado),
    horario_fim_bloqueado: normalizarHoraHHMM(horarios.horario_fim_bloqueado),
  };

  const { data, error } = await supabase
    .from("colaboradores_expedientes")
    .upsert(registro, { onConflict: "id_usuario" })
    .select(CAMPOS_EXPEDIENTE.join(", "))
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const idUsuario = Number(new URL(request.url).searchParams.get("id_usuario"));
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
    return NextResponse.json({ error: "Profissional inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: usuarioOk, error: uErr } = await supabase
    .from("usuarios")
    .select("id")
    .eq("id", idUsuario)
    .eq("id_empresa", empresaId)
    .maybeSingle();
  if (uErr) {
    console.error(uErr);
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }
  if (!usuarioOk) {
    return NextResponse.json({ error: "Profissional não encontrado." }, { status: 404 });
  }

  const { error } = await supabase
    .from("colaboradores_expedientes")
    .delete()
    .eq("id_usuario", idUsuario);
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
