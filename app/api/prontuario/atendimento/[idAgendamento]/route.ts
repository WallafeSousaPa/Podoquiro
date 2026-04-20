import { NextResponse } from "next/server";
import { getUsuarioAgendaSomentePropriaColuna } from "@/lib/agenda/permissoes-calendario";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "Prontuario";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type RouteContext = { params: Promise<{ idAgendamento: string }> };

export async function GET(_request: Request, context: RouteContext) {
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
  const idAgendamento = Number(idParam);
  if (!Number.isFinite(idAgendamento) || idAgendamento <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const somentePropria = await getUsuarioAgendaSomentePropriaColuna(
    supabase,
    sessionUserId,
  );
  if (!somentePropria) {
    return NextResponse.json(
      { error: "Acesso permitido apenas ao perfil podólogo." },
      { status: 403 },
    );
  }

  const { data: ag, error: agErr } = await supabase
    .from("agendamentos")
    .select(
      `
      id,
      id_empresa,
      id_usuario,
      id_paciente,
      status,
      data_hora_inicio,
      data_hora_fim,
      pacientes ( nome_completo, nome_social )
    `,
    )
    .eq("id", idAgendamento)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (agErr) {
    console.error(agErr);
    return NextResponse.json({ error: agErr.message }, { status: 500 });
  }
  if (!ag) {
    return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
  }
  if ((ag.id_usuario as number) !== sessionUserId) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }
  if (String(ag.status) !== "em_andamento") {
    return NextResponse.json(
      { error: "O prontuário só pode ser preenchido com status Em andamento." },
      { status: 400 },
    );
  }

  const pacRaw = ag.pacientes as
    | { nome_completo: string | null; nome_social: string | null }
    | { nome_completo: string | null; nome_social: string | null }[]
    | null;
  const pac = Array.isArray(pacRaw) ? pacRaw[0] : pacRaw;
  const pacienteNome =
    (pac?.nome_completo && String(pac.nome_completo).trim()) ||
    (pac?.nome_social && String(pac.nome_social).trim()) ||
    "Paciente";

  const { data: aps, error: apErr } = await supabase
    .from("agendamento_procedimentos")
    .select("id_procedimento, procedimentos ( procedimento )")
    .eq("id_agendamento", idAgendamento);

  if (apErr) {
    console.error(apErr);
    return NextResponse.json({ error: apErr.message }, { status: 500 });
  }

  const procedimentos = (aps ?? []).map((row) => {
    const pr = row.procedimentos as
      | { procedimento: string }
      | { procedimento: string }[]
      | null;
    const p = Array.isArray(pr) ? pr[0] : pr;
    return {
      id_procedimento: row.id_procedimento as number,
      nome: p?.procedimento ?? "—",
    };
  });

  const { data: pront, error: prErr } = await supabase
    .from("prontuario_paciente")
    .select("id, evolucao, fotos, procedimentos_realizados, data_registro")
    .eq("id_agendamento", idAgendamento)
    .maybeSingle();

  if (prErr) {
    console.error(prErr);
    return NextResponse.json({ error: prErr.message }, { status: 500 });
  }

  const paths = (pront?.fotos as string[] | null) ?? [];
  const fotosComUrl: { path: string; url: string }[] = [];
  for (const path of paths) {
    if (typeof path !== "string" || !path.trim()) continue;
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);
    if (signErr) {
      console.error(signErr);
      continue;
    }
    if (signed?.signedUrl) {
      fotosComUrl.push({ path, url: signed.signedUrl });
    }
  }

  return NextResponse.json({
    paciente_nome: pacienteNome,
    agendamento: {
      id: ag.id,
      data_hora_inicio: ag.data_hora_inicio,
      data_hora_fim: ag.data_hora_fim,
      status: ag.status,
    },
    procedimentos,
    prontuario: pront
      ? {
          id: pront.id,
          evolucao: String(pront.evolucao ?? ""),
          procedimentos_realizados: (pront.procedimentos_realizados as number[]) ?? [],
          fotos: fotosComUrl,
          data_registro: pront.data_registro,
        }
      : null,
  });
}
