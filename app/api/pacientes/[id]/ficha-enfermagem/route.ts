import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUsuarioGrupoAdministrativo } from "@/lib/dashboard/menu-grupo";
import {
  parseEmpresaId,
  parseUsuarioId,
  respostaSeNaoEnfermagem,
} from "@/lib/enfermagem/acesso";
import {
  preencherIdentificacao,
  sanitizarFicha,
  type PacienteIdentificacao,
} from "@/lib/enfermagem/ficha";
import {
  diasEntreAnamnesesDoValorDb,
  permiteNovaAnamneseCronologica,
  textoBloqueioAnamneseIntervalo,
} from "@/lib/avaliacoes/anamnese-intervalo";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

const SELECT_PACIENTE =
  "id, nome_completo, nome_social, genero, data_nascimento, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf";

const BUCKET_TERMO_ASSINATURA = "termo_assinatura_virtual";
const MAX_BYTES_PDF_TERMO = Math.floor(1.5 * 1024 * 1024);

function buildTermoAssinaturaPath(idPaciente: number, fileName: string): string {
  const safeBase = fileName.replace(/[^\w.\-]+/g, "_").slice(0, 140);
  const ts = Date.now();
  return `paciente_${idPaciente}/termo_virtual/${ts}_${safeBase}`;
}

function ymdLocalDeIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { id: idParam } = await context.params;
  const idPaciente = Number(idParam);
  if (!Number.isFinite(idPaciente) || idPaciente <= 0) {
    return NextResponse.json({ error: "Paciente inválido." }, { status: 400 });
  }

  const idAgendamento = Number(new URL(request.url).searchParams.get("id_agendamento"));
  if (!Number.isFinite(idAgendamento) || idAgendamento <= 0) {
    return NextResponse.json({ error: "Agendamento inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const bloqueio = await respostaSeNaoEnfermagem(supabase, session);
  if (bloqueio) return bloqueio;

  const { data: paciente, error: pErr } = await supabase
    .from("pacientes")
    .select(SELECT_PACIENTE)
    .eq("id", idPaciente)
    .eq("id_empresa", empresaId)
    .maybeSingle();
  if (pErr) {
    console.error(pErr);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  if (!paciente) {
    return NextResponse.json({ error: "Paciente não encontrado." }, { status: 404 });
  }

  const { data: ag, error: aErr } = await supabase
    .from("agendamentos")
    .select("id, data_hora_inicio")
    .eq("id", idAgendamento)
    .eq("id_empresa", empresaId)
    .eq("id_paciente", idPaciente)
    .maybeSingle();
  if (aErr) {
    console.error(aErr);
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }
  if (!ag) {
    return NextResponse.json({ error: "Atendimento não encontrado." }, { status: 404 });
  }

  const { data: fichaRow, error: fErr } = await supabase
    .from("pacientes_ficha_enfermagem")
    .select("id, dados, updated_at, arquivo_termo_assinatura_virtual")
    .eq("id_agendamento", idAgendamento)
    .eq("id_empresa", empresaId)
    .maybeSingle();
  if (fErr) {
    console.error(fErr);
    return NextResponse.json({ error: fErr.message }, { status: 500 });
  }

  const identificacao = paciente as PacienteIdentificacao;
  const dados = fichaRow
    ? sanitizarFicha(fichaRow.dados)
    : preencherIdentificacao(identificacao, ymdLocalDeIso(ag.data_hora_inicio as string));

  const pathTermo = fichaRow?.arquivo_termo_assinatura_virtual;
  return NextResponse.json({
    id: (fichaRow?.id as number | undefined) ?? null,
    updated_at: (fichaRow?.updated_at as string | undefined) ?? null,
    arquivo_termo_assinatura_virtual: typeof pathTermo === "string" && pathTermo.trim() ? pathTermo : null,
    dados,
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  const userId = parseUsuarioId(session.sub);
  if (!empresaId || !userId) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const { id: idParam } = await context.params;
  const idPaciente = Number(idParam);
  if (!Number.isFinite(idPaciente) || idPaciente <= 0) {
    return NextResponse.json({ error: "Paciente inválido." }, { status: 400 });
  }

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }

  const dadosCampo = fd.get("dados");
  let dadosJson: unknown;
  try {
    dadosJson = typeof dadosCampo === "string" ? JSON.parse(dadosCampo) : null;
  } catch {
    return NextResponse.json({ error: "Ficha inválida." }, { status: 400 });
  }
  const arquivoCampo = fd.get("arquivo_termo_assinatura_virtual");
  const arquivoTermo =
    arquivoCampo instanceof File && arquivoCampo.size > 0 ? arquivoCampo : null;
  const manterTermo = fd.get("manter_termo_existente") === "1";

  const idAgendamento = Number(fd.get("id_agendamento"));
  if (!Number.isFinite(idAgendamento) || idAgendamento <= 0) {
    return NextResponse.json({ error: "Agendamento inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const bloqueio = await respostaSeNaoEnfermagem(supabase, session);
  if (bloqueio) return bloqueio;

  const { data: ag, error: aErr } = await supabase
    .from("agendamentos")
    .select("id")
    .eq("id", idAgendamento)
    .eq("id_empresa", empresaId)
    .eq("id_paciente", idPaciente)
    .maybeSingle();
  if (aErr) {
    console.error(aErr);
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }
  if (!ag) {
    return NextResponse.json({ error: "Atendimento não encontrado." }, { status: 404 });
  }

  const dados = sanitizarFicha(dadosJson);
  if (!dados.nome.trim()) {
    const { data: pacNome } = await supabase
      .from("pacientes")
      .select(
        "id, nome_completo, nome_social, genero, data_nascimento, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf",
      )
      .eq("id", idPaciente)
      .eq("id_empresa", empresaId)
      .maybeSingle();
    if (pacNome) {
      const base = preencherIdentificacao(pacNome as PacienteIdentificacao, dados.dataAdmissao);
      dados.nome = base.nome;
      if (!dados.prontuario) dados.prontuario = base.prontuario;
      if (!dados.telefone) dados.telefone = base.telefone;
      if (!dados.endereco) dados.endereco = base.endereco;
      if (!dados.sexo) dados.sexo = base.sexo;
      if (!dados.dn) dados.dn = base.dn;
      if (!dados.idade) dados.idade = base.idade;
    }
  }

  const { data: existente, error: exErr } = await supabase
    .from("pacientes_ficha_enfermagem")
    .select("id, arquivo_termo_assinatura_virtual")
    .eq("id_agendamento", idAgendamento)
    .eq("id_empresa", empresaId)
    .maybeSingle();
  if (exErr) {
    console.error(exErr);
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }
  if (!existente) {
    const { data: empRow, error: empErr } = await supabase
      .from("empresas")
      .select("dias_entre_anamneses_enfermagem")
      .eq("id", empresaId)
      .maybeSingle();
    if (empErr) {
      console.error(empErr);
      return NextResponse.json({ error: empErr.message }, { status: 500 });
    }
    const diasPolitica = diasEntreAnamnesesDoValorDb(empRow?.dias_entre_anamneses_enfermagem);
    if (diasPolitica != null) {
      const { data: ultima, error: ultErr } = await supabase
        .from("pacientes_ficha_enfermagem")
        .select("updated_at")
        .eq("id_paciente", idPaciente)
        .eq("id_empresa", empresaId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ultErr) {
        console.error(ultErr);
        return NextResponse.json({ error: ultErr.message }, { status: 500 });
      }
      const st = permiteNovaAnamneseCronologica({
        diasMinimos: diasPolitica,
        dataUltimaIso: ultima?.updated_at == null ? null : String(ultima.updated_at),
      });
      if (
        !st.permite &&
        st.diasRestantes != null &&
        st.diasPolitica != null &&
        st.dataUltimaBr != null
      ) {
        return NextResponse.json(
          {
            error: textoBloqueioAnamneseIntervalo(
              {
                diasRestantes: st.diasRestantes,
                diasPolitica: st.diasPolitica,
                dataUltimaBr: st.dataUltimaBr,
              },
              "avaliação de enfermagem",
            ),
          },
          { status: 409 },
        );
      }
    }
  }

  let pathTermo: string | null = null;
  if (arquivoTermo) {
    if (arquivoTermo.size > MAX_BYTES_PDF_TERMO) {
      return NextResponse.json(
        { error: "O PDF do termo de assinatura virtual ficou grande demais. Assine novamente." },
        { status: 400 },
      );
    }
    const nome = arquivoTermo.name.toLowerCase();
    const tipo = arquivoTermo.type.toLowerCase();
    if (!nome.endsWith(".pdf") && tipo !== "application/pdf") {
      return NextResponse.json({ error: "O termo precisa ser um PDF." }, { status: 400 });
    }
    const buffer = Buffer.from(await arquivoTermo.arrayBuffer());
    pathTermo = buildTermoAssinaturaPath(idPaciente, arquivoTermo.name || "termo_assinatura.pdf");
    const { error: upTermo } = await supabase.storage.from(BUCKET_TERMO_ASSINATURA).upload(pathTermo, buffer, {
      upsert: true,
      contentType: "application/pdf",
    });
    if (upTermo) {
      console.error(upTermo);
      return NextResponse.json({ error: upTermo.message }, { status: 500 });
    }
  } else if (manterTermo) {
    const salvoAntes = existente?.arquivo_termo_assinatura_virtual;
    pathTermo = typeof salvoAntes === "string" && salvoAntes.trim() ? salvoAntes.trim() : null;
  }
  if (!pathTermo) {
    return NextResponse.json(
      {
        error: "Preencha o Termo — assinatura virtual (marque a opção, leia e assine o termo).",
      },
      { status: 400 },
    );
  }

  const agora = new Date().toISOString();
  const { data: salvo, error: sErr } = await supabase
    .from("pacientes_ficha_enfermagem")
    .upsert(
      {
        id_empresa: empresaId,
        id_paciente: idPaciente,
        id_agendamento: idAgendamento,
        id_usuario: userId,
        dados,
        arquivo_termo_assinatura_virtual: pathTermo,
        updated_at: agora,
      },
      { onConflict: "id_agendamento" },
    )
    .select("id, updated_at")
    .single();

  if (sErr) {
    console.error(sErr);
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: salvo.id as number, updated_at: salvo.updated_at as string });
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  const userId = parseUsuarioId(session.sub);
  if (!empresaId || !userId) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const { id: idParam } = await context.params;
  const idPaciente = Number(idParam);
  const fichaId = Number(new URL(request.url).searchParams.get("ficha"));
  if (!Number.isFinite(idPaciente) || idPaciente <= 0 || !Number.isFinite(fichaId) || fichaId <= 0) {
    return NextResponse.json({ error: "Ficha inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const podeExcluir = await getUsuarioGrupoAdministrativo(supabase, userId);
  if (!podeExcluir) {
    return NextResponse.json(
      { error: "Somente usuários dos grupos Administrador ou Diretoria podem excluir avaliações." },
      { status: 403 },
    );
  }

  const { data: existente, error: exErr } = await supabase
    .from("pacientes_ficha_enfermagem")
    .select("id, arquivo_termo_assinatura_virtual")
    .eq("id", fichaId)
    .eq("id_paciente", idPaciente)
    .eq("id_empresa", empresaId)
    .maybeSingle();
  if (exErr) {
    console.error(exErr);
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }
  if (!existente) {
    return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  }

  const termo = existente.arquivo_termo_assinatura_virtual;
  if (typeof termo === "string" && termo.trim()) {
    await supabase.storage.from(BUCKET_TERMO_ASSINATURA).remove([termo.trim()]);
  }

  const { error: delErr } = await supabase
    .from("pacientes_ficha_enfermagem")
    .delete()
    .eq("id", fichaId)
    .eq("id_empresa", empresaId);
  if (delErr) {
    console.error(delErr);
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
