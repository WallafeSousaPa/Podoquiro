import { NextResponse } from "next/server";
import { calcularValorTotal } from "@/lib/agenda/totais";
import { getUsuarioAgendaSomentePropriaColuna } from "@/lib/agenda/permissoes-calendario";
import { validarProcedimentosDoColaborador } from "@/lib/colaborador-procedimentos";
import { montarCaminhoFotoProntuario } from "@/lib/prontuario/nomes-arquivo";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "Prontuario";
const MAX_FOTOS = 4;

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseJsonArrayNumber(raw: string): number[] {
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

function parseJsonArrayString(raw: string): string[] {
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  } catch {
    return [];
  }
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

  const sessionUserId = Number(session.sub);
  if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formulário inválido." }, { status: 400 });
  }

  const idAgendamento = Number(formData.get("id_agendamento"));
  if (!Number.isFinite(idAgendamento) || idAgendamento <= 0) {
    return NextResponse.json({ error: "Agendamento inválido." }, { status: 400 });
  }

  const evolucao = String(formData.get("evolucao") ?? "").trim();
  if (evolucao.length < 3) {
    return NextResponse.json(
      { error: "Informe a evolução (mínimo 3 caracteres)." },
      { status: 400 },
    );
  }

  const procedimentosIds = parseJsonArrayNumber(
    String(formData.get("procedimentos_ids") ?? "[]"),
  );
  if (procedimentosIds.length === 0) {
    return NextResponse.json(
      { error: "Selecione ao menos um procedimento realizado." },
      { status: 400 },
    );
  }

  const caminhosManter = parseJsonArrayString(
    String(formData.get("caminhos_manter") ?? "[]"),
  );

  const novosArquivos: File[] = [];
  for (const [key, val] of formData.entries()) {
    if (!key.startsWith("foto_")) continue;
    if (val instanceof File && val.size > 0) {
      novosArquivos.push(val);
    }
  }

  if (caminhosManter.length + novosArquivos.length > MAX_FOTOS) {
    return NextResponse.json(
      { error: `É permitido no máximo ${MAX_FOTOS} fotos no total.` },
      { status: 400 },
    );
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
      desconto,
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
      { error: "Só é possível registrar prontuário com status Em andamento." },
      { status: 400 },
    );
  }

  const validacaoProc = await validarProcedimentosDoColaborador(
    supabase,
    ag.id_usuario as number,
    empresaId,
    procedimentosIds,
  );
  if (!validacaoProc.ok) {
    return NextResponse.json(
      { error: validacaoProc.message },
      { status: 400 },
    );
  }

  const pacRaw = ag.pacientes as
    | { nome_completo: string | null; nome_social: string | null }
    | { nome_completo: string | null; nome_social: string | null }[]
    | null;
  const pac = Array.isArray(pacRaw) ? pacRaw[0] : pacRaw;
  const nomePaciente =
    (pac?.nome_completo && String(pac.nome_completo).trim()) ||
    (pac?.nome_social && String(pac.nome_social).trim()) ||
    "Paciente";

  const prefixoEmpresa = `${empresaId}/`;
  for (const p of caminhosManter) {
    if (!p.startsWith(prefixoEmpresa) || p.includes("..")) {
      return NextResponse.json({ error: "Caminho de foto inválido." }, { status: 400 });
    }
  }

  const { data: existente } = await supabase
    .from("prontuario_paciente")
    .select("fotos")
    .eq("id_agendamento", idAgendamento)
    .maybeSingle();

  const fotosAntigas = (existente?.fotos as string[] | null) ?? [];
  for (const p of caminhosManter) {
    if (!fotosAntigas.includes(p)) {
      return NextResponse.json(
        { error: "Referência a foto existente inválida." },
        { status: 400 },
      );
    }
  }

  const uploadedPaths: string[] = [];

  try {
    for (let i = 0; i < novosArquivos.length; i++) {
      const file = novosArquivos[i];
      const mime = file.type || "image/jpeg";
      const indiceArquivo = caminhosManter.length + i;
      const { pathRelativo } = montarCaminhoFotoProntuario(
        empresaId,
        nomePaciente,
        idAgendamento,
        indiceArquivo,
        mime,
      );
      const buf = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(pathRelativo, buf, {
          contentType: mime,
          upsert: true,
        });
      if (upErr) {
        throw new Error(upErr.message);
      }
      uploadedPaths.push(pathRelativo);
    }
  } catch (e) {
    for (const p of uploadedPaths) {
      await supabase.storage.from(BUCKET).remove([p]);
    }
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao enviar fotos." },
      { status: 500 },
    );
  }

  const fotosFinais = [...caminhosManter, ...uploadedPaths];

  const pathsRemovidos = fotosAntigas.filter((p) => !fotosFinais.includes(p));
  if (pathsRemovidos.length > 0) {
    await supabase.storage.from(BUCKET).remove(pathsRemovidos);
  }

  const procJson = [...new Set(procedimentosIds)];
  const { data: procRows, error: procErr } = await supabase
    .from("procedimentos")
    .select("id, valor_total")
    .eq("id_empresa", empresaId)
    .in("id", procJson);
  if (procErr) {
    console.error(procErr);
    return NextResponse.json({ error: procErr.message }, { status: 500 });
  }

  const procValorMap = new Map(
    (procRows ?? []).map((p) => [p.id as number, Number(p.valor_total)]),
  );
  if (procValorMap.size !== procJson.length) {
    return NextResponse.json(
      { error: "Um ou mais procedimentos são inválidos para esta empresa." },
      { status: 400 },
    );
  }
  const procedimentosLancamento = procJson.map((idProcedimento) => ({
    id_agendamento: idAgendamento,
    id_procedimento: idProcedimento,
    valor_aplicado: Math.round((procValorMap.get(idProcedimento) ?? 0) * 100) / 100,
  }));
  const valorBruto =
    Math.round(
      procedimentosLancamento.reduce((acc, p) => acc + p.valor_aplicado, 0) * 100,
    ) / 100;
  const descontoAtual = Number(ag.desconto ?? 0);
  const valorTotal = calcularValorTotal(valorBruto, descontoAtual);

  const { error: upsertErr } = await supabase.from("prontuario_paciente").upsert(
    {
      id_agendamento: idAgendamento,
      evolucao,
      fotos: fotosFinais,
      procedimentos_realizados: procJson,
      data_registro: new Date().toISOString(),
    },
    { onConflict: "id_agendamento" },
  );

  if (upsertErr) {
    console.error(upsertErr);
    for (const p of uploadedPaths) {
      await supabase.storage.from(BUCKET).remove([p]);
    }
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const { error: delProcErr } = await supabase
    .from("agendamento_procedimentos")
    .delete()
    .eq("id_agendamento", idAgendamento);
  if (delProcErr) {
    console.error(delProcErr);
    return NextResponse.json({ error: delProcErr.message }, { status: 500 });
  }

  const { error: insProcErr } = await supabase
    .from("agendamento_procedimentos")
    .insert(procedimentosLancamento);
  if (insProcErr) {
    console.error(insProcErr);
    return NextResponse.json({ error: insProcErr.message }, { status: 500 });
  }

  const { error: stAg } = await supabase
    .from("agendamentos")
    .update({ status: "realizado", valor_bruto: valorBruto, valor_total: valorTotal })
    .eq("id", idAgendamento)
    .eq("id_empresa", empresaId);

  if (stAg) {
    console.error(stAg);
    return NextResponse.json({ error: stAg.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
