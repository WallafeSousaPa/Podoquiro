import { NextResponse } from "next/server";
import {
  CAMPOS_FOTO_EVOLUCAO,
  isFormaContatoPaciente,
  optText,
  parsePositiveIdsFromFormData,
  SELECT_PACIENTES_EVOLUCAO_VINCULOS,
} from "@/lib/avaliacoes/evolucao";
import { syncPacientesEvolucaoVinculos } from "@/lib/avaliacoes/sync-pacientes-evolucao-vinculos";
import { jsonAnamneseErroComCodigo } from "@/lib/aplicacao/resposta-erro-anamnese";
import {
  diasEntreAnamnesesDoValorDb,
  permiteNovaAnamneseCronologica,
  textoBloqueioAnamneseIntervalo,
} from "@/lib/avaliacoes/anamnese-intervalo";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function empresaIdOuNull(idEmpresa: string): number | null {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const BUCKET = "evolucao_analise";
const BUCKET_TERMO_ASSINATURA = "termo_assinatura_virtual";

function toPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildFotoPath(idPaciente: number, campo: string, fileName: string): string {
  const safeBase = fileName.replace(/[^\w.\-]+/g, "_");
  const ts = Date.now();
  return `paciente_${idPaciente}/${campo}/${ts}_${safeBase}`;
}

function buildTermoAssinaturaPath(idPaciente: number, fileName: string): string {
  const safeBase = fileName.replace(/[^\w.\-]+/g, "_").slice(0, 140);
  const ts = Date.now();
  return `paciente_${idPaciente}/termo_virtual/${ts}_${safeBase}`;
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
      id_pe_esquerdo, id_pe_direito,
      digito_pressao, varizes, claudicacao, temperatura, oleo, agua, observacao,
      id_formato_dedos, id_formato_pe, forma_contato, tratamento_sugerido,
      foto_plantar_direito, foto_plantar_esquerdo, foto_dorso_direito, foto_dorso_esquerdo, foto_doc_termo_consentimento,
      arquivo_termo_assinatura_virtual,
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

  const supabase = createAdminClient();

  const idResponsavelSessao = toPositiveNumber(session.sub);
  if (!idResponsavelSessao) {
    return jsonAnamneseErroComCodigo(request, supabase, session, {
      status: 400,
      idPaciente: null,
      etapa: "sessao_invalida",
      detalhe: { sub: session.sub },
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    return jsonAnamneseErroComCodigo(request, supabase, session, {
      status: 400,
      idPaciente: null,
      etapa: "form_data_parse",
      detalhe: e,
    });
  }

  const idPaciente = toPositiveNumber(formData.get("id_paciente"));
  if (!idPaciente) {
    return jsonAnamneseErroComCodigo(request, supabase, session, {
      status: 400,
      idPaciente: null,
      etapa: "id_paciente_obrigatorio",
      detalhe: { id_paciente_raw: String(formData.get("id_paciente") ?? "") },
    });
  }

  const empresaSessao = empresaIdOuNull(session.idEmpresa);
  if (empresaSessao == null) {
    return jsonAnamneseErroComCodigo(request, supabase, session, {
      status: 400,
      idPaciente,
      etapa: "empresa_sessao_invalida",
      detalhe: { idEmpresa: session.idEmpresa },
    });
  }

  const { data: pacEmp, error: errPacEmp } = await supabase
    .from("pacientes")
    .select("id")
    .eq("id", idPaciente)
    .eq("id_empresa", empresaSessao)
    .maybeSingle();
  if (errPacEmp) {
    return jsonAnamneseErroComCodigo(request, supabase, session, {
      status: 500,
      idPaciente,
      etapa: "paciente_escopo_empresa",
      detalhe: errPacEmp,
    });
  }
  if (!pacEmp) {
    return NextResponse.json(
      { error: "Paciente não encontrado ou não pertence à empresa atual." },
      { status: 403 },
    );
  }

  const { data: empRow, error: errEmp } = await supabase
    .from("empresas")
    .select("dias_entre_anamneses")
    .eq("id", empresaSessao)
    .maybeSingle();
  if (errEmp) {
    return jsonAnamneseErroComCodigo(request, supabase, session, {
      status: 500,
      idPaciente,
      etapa: "empresa_politica_anamnese",
      detalhe: errEmp,
    });
  }
  const diasPolitica = diasEntreAnamnesesDoValorDb(empRow?.dias_entre_anamneses);
  if (diasPolitica != null) {
    const { data: ultima, error: errUltima } = await supabase
      .from("pacientes_evolucao")
      .select("data")
      .eq("id_paciente", idPaciente)
      .eq("ativo", true)
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (errUltima) {
      return jsonAnamneseErroComCodigo(request, supabase, session, {
        status: 500,
        idPaciente,
        etapa: "ultima_anamnese",
        detalhe: errUltima,
      });
    }
    const rawUlt = ultima?.data;
    const ultIso = rawUlt == null ? null : String(rawUlt);
    const st = permiteNovaAnamneseCronologica({
      diasMinimos: diasPolitica,
      dataUltimaIso: ultIso,
    });
    if (
      !st.permite &&
      st.diasRestantes != null &&
      st.diasPolitica != null &&
      st.dataUltimaBr != null
    ) {
      const msg = textoBloqueioAnamneseIntervalo({
        diasRestantes: st.diasRestantes,
        diasPolitica: st.diasPolitica,
        dataUltimaBr: st.dataUltimaBr,
      });
      return NextResponse.json({ error: msg }, { status: 409 });
    }
  }

  const formaContatoRaw = optText(formData.get("forma_contato"));
  if (formaContatoRaw && !isFormaContatoPaciente(formaContatoRaw)) {
    return jsonAnamneseErroComCodigo(request, supabase, session, {
      status: 400,
      idPaciente,
      etapa: "forma_contato_invalida",
      detalhe: { forma_contato: formaContatoRaw },
    });
  }

  const vinculos = {
    condicoes: parsePositiveIdsFromFormData(formData, "id_condicao"),
    tiposUnha: parsePositiveIdsFromFormData(formData, "id_tipo_unha"),
    hidroses: parsePositiveIdsFromFormData(formData, "id_hidrose"),
    lesoesMecanicas: parsePositiveIdsFromFormData(formData, "id_lesoes_mecanicas"),
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

  try {
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
        return jsonAnamneseErroComCodigo(request, supabase, session, {
          status: 500,
          idPaciente,
          etapa: `upload_storage:${campo}`,
          detalhe: uploadError,
        });
      }
      row[campo] = path;
    }

    const termoVirt = formData.get("arquivo_termo_assinatura_virtual");
    if (termoVirt instanceof File && termoVirt.size > 0) {
      const buffer = Buffer.from(await termoVirt.arrayBuffer());
      const pathTermo = buildTermoAssinaturaPath(
        idPaciente,
        termoVirt.name || "termo_assinatura.pdf",
      );
      const { error: upTermo } = await supabase.storage.from(BUCKET_TERMO_ASSINATURA).upload(pathTermo, buffer, {
        upsert: true,
        contentType: termoVirt.type || "application/pdf",
      });
      if (upTermo) {
        return jsonAnamneseErroComCodigo(request, supabase, session, {
          status: 500,
          idPaciente,
          etapa: "upload_storage:termo_assinatura_virtual",
          detalhe: upTermo,
        });
      }
      row.arquivo_termo_assinatura_virtual = pathTermo;
    }

    const { data, error } = await supabase
      .from("pacientes_evolucao")
      .insert(row)
      .select("id")
      .single();
    if (error) {
      return jsonAnamneseErroComCodigo(request, supabase, session, {
        status: 500,
        idPaciente,
        etapa: "insert_pacientes_evolucao",
        detalhe: error,
      });
    }
    const novoId = toPositiveNumber(data?.id);
    if (!novoId) {
      return jsonAnamneseErroComCodigo(request, supabase, session, {
        status: 500,
        idPaciente,
        etapa: "insert_sem_id",
        detalhe: { data },
      });
    }

    const syncErr = await syncPacientesEvolucaoVinculos(supabase, novoId, vinculos);
    if (syncErr.error) {
      return jsonAnamneseErroComCodigo(request, supabase, session, {
        status: 500,
        idPaciente,
        etapa: "sync_vinculos",
        detalhe: { mensagem: syncErr.error, novoId },
      });
    }

    const { data: completo, error: loadErr } = await supabase
      .from("pacientes_evolucao")
      .select(
        `
      id, id_paciente, id_responsavel,
      pressao_arterial, glicemia, atividade_fisica, tipo_calcado, alergias,
      id_pe_esquerdo, id_pe_direito,
      digito_pressao, varizes, claudicacao, temperatura, oleo, agua, observacao,
      id_formato_dedos, id_formato_pe, forma_contato, tratamento_sugerido,
      foto_plantar_direito, foto_plantar_esquerdo, foto_dorso_direito, foto_dorso_esquerdo, foto_doc_termo_consentimento,
      arquivo_termo_assinatura_virtual,
      ativo, data,
      ${SELECT_PACIENTES_EVOLUCAO_VINCULOS}
    `,
      )
      .eq("id", novoId)
      .maybeSingle();
    if (loadErr) {
      return jsonAnamneseErroComCodigo(request, supabase, session, {
        status: 500,
        idPaciente,
        etapa: "load_completo",
        detalhe: loadErr,
      });
    }
    return NextResponse.json({ data: completo });
  } catch (e) {
    return jsonAnamneseErroComCodigo(request, supabase, session, {
      status: 500,
      idPaciente,
      etapa: "excecao_inesperada",
      detalhe: e,
    });
  }
}
