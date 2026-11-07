import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { respostaSeNaoEnfermagem, parseEmpresaId, parseUsuarioId } from "@/lib/enfermagem/acesso";
import {
  CONTRATO_VAZIO,
  comAssinaturaEnfermeira,
  hojeIsoSaoPaulo,
  isoMaisUmAno,
  sanitizarContrato,
  type ContratoEnfermagem,
} from "@/lib/enfermagem/contrato";
import { assinaturaImagem } from "@/lib/assinatura-imagem";
import { formatarCpfExibicao } from "@/lib/termo-consentimento/texto-podoquiro";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

function enderecoClinica(row: {
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
} | null): string {
  if (!row) return "";
  const linha = [row.endereco, row.numero].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
  const resto = [row.bairro, row.cidade].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
  return [linha, resto].filter(Boolean).join(" — ");
}

function cpfOuVazio(valor: string | null | undefined): string {
  const t = (valor ?? "").trim();
  if (!t) return "";
  const fmt = formatarCpfExibicao(t);
  return fmt === "não informado" ? t : fmt;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const supabase = createAdminClient();
  const bloqueio = await respostaSeNaoEnfermagem(
    supabase,
    session,
    "Somente Enfermagem, Administrador ou Diretoria pode abrir o contrato.",
  );
  if (bloqueio) return bloqueio;

  const empresaId = parseEmpresaId(session.idEmpresa);
  const userId = parseUsuarioId(session.sub);
  const idPaciente = Number((await context.params).id);
  if (!empresaId || !userId || !Number.isFinite(idPaciente) || idPaciente <= 0) {
    return NextResponse.json({ error: "Paciente inválido." }, { status: 400 });
  }

  const [pacienteRes, usuarioRes, empresaRes, contratosRes] = await Promise.all([
    supabase
      .from("pacientes")
      .select("nome_completo, nome_social, estado_civil, cpf, logradouro, numero, bairro, cidade, uf")
      .eq("id", idPaciente)
      .eq("id_empresa", empresaId)
      .maybeSingle(),
    supabase.from("usuarios").select("nome_completo, usuario, cpf, assinatura").eq("id", userId).maybeSingle(),
    supabase
      .from("empresas")
      .select("endereco, numero, bairro, cidade")
      .eq("id", empresaId)
      .maybeSingle(),
    supabase
      .from("pacientes_contratos_enfermagem")
      .select("id, id_agendamento, id_usuario, created_at, dados")
      .eq("id_empresa", empresaId)
      .eq("id_paciente", idPaciente)
      .order("created_at", { ascending: false }),
  ]);

  const erro = [pacienteRes, usuarioRes, empresaRes, contratosRes].find((r) => r.error)?.error;
  if (erro) return NextResponse.json({ error: erro.message }, { status: 500 });
  if (!pacienteRes.data) {
    return NextResponse.json({ error: "Paciente não encontrado." }, { status: 404 });
  }

  const pac = pacienteRes.data;
  const usu = usuarioRes.data;
  const hoje = hojeIsoSaoPaulo();
  const nomePaciente = (pac.nome_completo ?? "").trim() || (pac.nome_social ?? "").trim();
  const prefill: ContratoEnfermagem = {
    ...CONTRATO_VAZIO,
    enfermeira_nome: (usu?.nome_completo ?? "").trim() || (usu?.usuario ?? "").trim(),
    enfermeira_endereco: enderecoClinica(empresaRes.data),
    enfermeira_cpf: cpfOuVazio(usu?.cpf),
    paciente_nome: nomePaciente,
    paciente_estado_civil: (pac.estado_civil ?? "").trim(),
    paciente_rua: [pac.logradouro, pac.numero].map((p) => (p ?? "").trim()).filter(Boolean).join(", "),
    paciente_bairro: (pac.bairro ?? "").trim(),
    paciente_cidade: (pac.cidade ?? "").trim(),
    paciente_uf: (pac.uf ?? "").trim().toUpperCase(),
    paciente_cpf: cpfOuVazio(pac.cpf),
    data_inicio: hoje,
    data_fim: isoMaisUmAno(hoje),
    local_assinatura: (empresaRes.data?.cidade ?? "").trim() || "Ilhéus",
    data_assinatura: hoje,
  };

  const contratosBase = contratosRes.data ?? [];
  const idsUsuarios = [
    ...new Set(
      contratosBase
        .map((row) => Number(row.id_usuario))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  const assinaturaPorUsuario = new Map<number, string>();
  if (idsUsuarios.length > 0) {
    const { data: donos, error: dErr } = await supabase
      .from("usuarios")
      .select("id, assinatura")
      .eq("id_empresa", empresaId)
      .in("id", idsUsuarios);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
    for (const dono of donos ?? []) {
      const imagem = assinaturaImagem(dono.assinatura);
      if (imagem) assinaturaPorUsuario.set(dono.id as number, imagem);
    }
  }
  const contratos = contratosBase.map((row) => {
    const limpo = sanitizarContrato(row.dados);
    const dados = comAssinaturaEnfermeira(
      limpo.ok ? limpo.dados : { ...CONTRATO_VAZIO },
      assinaturaPorUsuario.get(Number(row.id_usuario)),
    );
    return { id: row.id, id_agendamento: row.id_agendamento, created_at: row.created_at, dados };
  });

  return NextResponse.json({
    prefill,
    tem_assinatura_enfermeira: Boolean(assinaturaImagem(usu?.assinatura)),
    contratos,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const supabase = createAdminClient();
  const bloqueio = await respostaSeNaoEnfermagem(
    supabase,
    session,
    "Somente Enfermagem, Administrador ou Diretoria pode salvar o contrato.",
  );
  if (bloqueio) return bloqueio;

  const empresaId = parseEmpresaId(session.idEmpresa);
  const userId = parseUsuarioId(session.sub);
  const idPaciente = Number((await context.params).id);
  if (!empresaId || !userId || !Number.isFinite(idPaciente) || idPaciente <= 0) {
    return NextResponse.json({ error: "Paciente inválido." }, { status: 400 });
  }

  let body: { id_agendamento?: unknown; dados?: unknown };
  try {
    body = (await request.json()) as { id_agendamento?: unknown; dados?: unknown };
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }

  const limpo = sanitizarContrato(body.dados);
  if (!limpo.ok) return NextResponse.json({ error: limpo.erro }, { status: 400 });

  const idAgendamento = Number(body.id_agendamento);
  if (!Number.isFinite(idAgendamento) || idAgendamento <= 0) {
    return NextResponse.json({ error: "Agendamento inválido." }, { status: 400 });
  }

  const { data: ag, error: aErr } = await supabase
    .from("agendamentos")
    .select("id")
    .eq("id", idAgendamento)
    .eq("id_empresa", empresaId)
    .eq("id_paciente", idPaciente)
    .maybeSingle();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (!ag) return NextResponse.json({ error: "Atendimento não encontrado." }, { status: 404 });

  const { data: usuarioAssinatura, error: uErr } = await supabase
    .from("usuarios")
    .select("assinatura")
    .eq("id", userId)
    .eq("id_empresa", empresaId)
    .maybeSingle();
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  const dados: ContratoEnfermagem = {
    ...limpo.dados,
    assinatura_enfermeira: assinaturaImagem(usuarioAssinatura?.assinatura),
  };

  const { data: salvo, error: sErr } = await supabase
    .from("pacientes_contratos_enfermagem")
    .insert({
      id_empresa: empresaId,
      id_paciente: idPaciente,
      id_agendamento: idAgendamento,
      id_usuario: userId,
      dados,
    })
    .select("id, created_at")
    .single();
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  return NextResponse.json({ id: salvo.id as number, created_at: salvo.created_at as string, dados });
}
