import { NextResponse } from "next/server";
import { CAMPOS_FOTO_EVOLUCAO, isFormaContatoPaciente, optText } from "@/lib/avaliacoes/evolucao";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "evolucao_analise";
type RouteContext = { params: Promise<{ id: string }> };

function toPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildFotoPath(idPaciente: number, campo: string, fileName: string): string {
  const safeBase = fileName.replace(/[^\w.\-]+/g, "_");
  const ts = Date.now();
  return `paciente_${idPaciente}/${campo}/${ts}_${safeBase}`;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const idResponsavelSessao = toPositiveNumber(session.sub);
  if (!idResponsavelSessao) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const { id: idParam } = await context.params;
  const id = toPositiveNumber(idParam);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: existente, error: exErr } = await supabase
    .from("pacientes_evolucao")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if (!existente) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { ativo?: unknown };
    if (typeof body.ativo !== "boolean") {
      return NextResponse.json({ error: "Apenas atualização de status por JSON." }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("pacientes_evolucao")
      .update({ ativo: body.ativo })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formulário inválido." }, { status: 400 });
  }

  const idPaciente = toPositiveNumber(formData.get("id_paciente")) ?? Number(existente.id_paciente);
  const formaContatoRaw = optText(formData.get("forma_contato"));
  if (formaContatoRaw && !isFormaContatoPaciente(formaContatoRaw)) {
    return NextResponse.json({ error: "Forma de contato inválida." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    id_paciente: idPaciente,
    id_responsavel: idResponsavelSessao,
    id_condicao: toPositiveNumber(formData.get("id_condicao")),
    pressao_arterial: optText(formData.get("pressao_arterial")),
    glicemia: optText(formData.get("glicemia")),
    atividade_fisica: optText(formData.get("atividade_fisica")),
    tipo_calcado: optText(formData.get("tipo_calcado")),
    alergias: optText(formData.get("alergias")),
    id_tipo_unha: toPositiveNumber(formData.get("id_tipo_unha")),
    id_pe_esquerdo: toPositiveNumber(formData.get("id_pe_esquerdo")),
    id_pe_direito: toPositiveNumber(formData.get("id_pe_direito")),
    id_hidrose: toPositiveNumber(formData.get("id_hidrose")),
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
  };

  for (const campo of CAMPOS_FOTO_EVOLUCAO) {
    const manterPath = optText(formData.get(`${campo}_path`));
    const file = formData.get(campo);
    if (file instanceof File && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const novoPath = buildFotoPath(idPaciente, campo, file.name || `${campo}.jpg`);
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(novoPath, buffer, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
      const antigo = existente[campo] as string | null;
      if (antigo) await supabase.storage.from(BUCKET).remove([antigo]);
      patch[campo] = novoPath;
    } else {
      patch[campo] = manterPath;
    }
  }

  const { data, error } = await supabase
    .from("pacientes_evolucao")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  return NextResponse.json({ data });
}
