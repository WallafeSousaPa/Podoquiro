import { NextResponse } from "next/server";
import {
  CAMPOS_FOTO_EVOLUCAO,
  isFormaContatoPaciente,
  optText,
  parsePositiveIdsFromFormData,
  SELECT_PACIENTES_EVOLUCAO_VINCULOS,
} from "@/lib/avaliacoes/evolucao";
import { syncPacientesEvolucaoVinculos } from "@/lib/avaliacoes/sync-pacientes-evolucao-vinculos";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "evolucao_analise";

function toPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildFotoPath(idPaciente: number, campo: string, fileName: string): string {
  const safeBase = fileName.replace(/[^\w.\-]+/g, "_");
  const ts = Date.now();
  return `paciente_${idPaciente}/${campo}/${ts}_${safeBase}`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const url = new URL(request.url);
  const incluirInativos = url.searchParams.get("incluir_inativos") === "1";
  const idPaciente = toPositiveNumber(url.searchParams.get("id_paciente"));

  const supabase = createAdminClient();
  let query = supabase
    .from("pacientes_evolucao")
    .select(
      `
      id, id_paciente, id_responsavel,
      pressao_arterial, glicemia, atividade_fisica, tipo_calcado, alergias,
      id_pe_esquerdo, id_pe_direito, id_lesoes_mecanicas,
      digito_pressao, varizes, claudicacao, temperatura, oleo, agua, observacao,
      id_formato_dedos, id_formato_pe, forma_contato, tratamento_sugerido,
      foto_plantar_direito, foto_plantar_esquerdo, foto_dorso_direito, foto_dorso_esquerdo, foto_doc_termo_consentimento,
      ativo, data,
      ${SELECT_PACIENTES_EVOLUCAO_VINCULOS},
      pacientes ( id, nome_completo, nome_social ),
      usuarios ( id, usuario, nome_completo )
    `,
    )
    .order("data", { ascending: false });

  if (!incluirInativos) query = query.eq("ativo", true);
  if (idPaciente) query = query.eq("id_paciente", idPaciente);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const idResponsavelSessao = toPositiveNumber(session.sub);
  if (!idResponsavelSessao) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formulário inválido." }, { status: 400 });
  }

  const idPaciente = toPositiveNumber(formData.get("id_paciente"));
  if (!idPaciente) {
    return NextResponse.json({ error: "Paciente é obrigatório." }, { status: 400 });
  }

  /* Campos opcionais no FormData (ex.: id_agendamento) são ignorados: não há escrita em agendamentos. */

  const formaContatoRaw = optText(formData.get("forma_contato"));
  if (formaContatoRaw && !isFormaContatoPaciente(formaContatoRaw)) {
    return NextResponse.json({ error: "Forma de contato inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const vinculos = {
    condicoes: parsePositiveIdsFromFormData(formData, "id_condicao"),
    tiposUnha: parsePositiveIdsFromFormData(formData, "id_tipo_unha"),
    hidroses: parsePositiveIdsFromFormData(formData, "id_hidrose"),
  };

  const row: Record<string, unknown> = {
    id_paciente: idPaciente,
    id_responsavel: idResponsavelSessao,
    pressao_arterial: optText(formData.get("pressao_arterial")),
    glicemia: optText(formData.get("glicemia")),
    atividade_fisica: optText(formData.get("atividade_fisica")),
    tipo_calcado: optText(formData.get("tipo_calcado")),
    alergias: optText(formData.get("alergias")),
    id_pe_esquerdo: toPositiveNumber(formData.get("id_pe_esquerdo")),
    id_pe_direito: toPositiveNumber(formData.get("id_pe_direito")),
    id_lesoes_mecanicas: toPositiveNumber(formData.get("id_lesoes_mecanicas")),
    digito_pressao: optText(formData.get("digito_pressao")),
    varizes: optText(formData.get("varizes")),
    claudicacao: optText(formData.get("claudicacao")),
    temperatura: optText(formData.get("temperatura")),
    oleo: optText(formData.get("oleo")),
    agua: optText(formData.get("agua")),
    observacao: optText(formData.get("observacao")),
    id_formato_dedos: toPositiveNumber(formData.get("id_formato_dedos")),
    id_formato_pe: toPositiveNumber(formData.get("id_formato_pe")),
    forma_contato: formaContatoRaw,
    tratamento_sugerido: optText(formData.get("tratamento_sugerido")),
    ativo: true,
  };

  for (const campo of CAMPOS_FOTO_EVOLUCAO) {
    const file = formData.get(campo);
    if (!(file instanceof File) || file.size <= 0) {
      row[campo] = null;
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = buildFotoPath(idPaciente, campo, file.name || `${campo}.jpg`);
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
    row[campo] = path;
  }

  const { data, error } = await supabase
    .from("pacientes_evolucao")
    .insert(row)
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const novoId = toPositiveNumber(data?.id);
  if (!novoId) return NextResponse.json({ error: "Falha ao obter ID da evolução." }, { status: 500 });

  const syncErr = await syncPacientesEvolucaoVinculos(supabase, novoId, vinculos);
  if (syncErr.error) return NextResponse.json({ error: syncErr.error }, { status: 500 });

  const { data: completo, error: loadErr } = await supabase
    .from("pacientes_evolucao")
    .select(
      `
      id, id_paciente, id_responsavel,
      pressao_arterial, glicemia, atividade_fisica, tipo_calcado, alergias,
      id_pe_esquerdo, id_pe_direito, id_lesoes_mecanicas,
      digito_pressao, varizes, claudicacao, temperatura, oleo, agua, observacao,
      id_formato_dedos, id_formato_pe, forma_contato, tratamento_sugerido,
      foto_plantar_direito, foto_plantar_esquerdo, foto_dorso_direito, foto_dorso_esquerdo, foto_doc_termo_consentimento,
      ativo, data,
      ${SELECT_PACIENTES_EVOLUCAO_VINCULOS}
    `,
    )
    .eq("id", novoId)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  return NextResponse.json({ data: completo });
}
