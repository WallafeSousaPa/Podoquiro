import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarPacientesPorNomeEmpresa } from "@/lib/pacientes/buscar-pacientes-nome-empresa";
import { dayStartIsoBr, nextDayStartIsoBr } from "@/lib/relatorios/periodo";

export type NfseFocusConsultaRow = {
  id: string;
  id_agendamento: number;
  id_paciente: number;
  focus_ref: string;
  status: string;
  numero_nfse: string | null;
  codigo_verificacao: string | null;
  numero_rps: string | null;
  serie_rps: string | null;
  valor_servicos: number;
  discriminacao: string;
  url_danfse: string | null;
  error_message: string | null;
  created_at: string;
  emitted_at: string | null;
  paciente_nome: string;
  data_hora_atendimento: string | null;
};

function nomePaciente(
  p:
    | { nome_completo?: string | null; nome_social?: string | null }
    | null
    | undefined,
): string {
  const nc = p?.nome_completo != null ? String(p.nome_completo).trim() : "";
  const ns = p?.nome_social != null ? String(p.nome_social).trim() : "";
  return nc || ns || "—";
}

export async function listarNfseFocusConsulta(
  supabase: SupabaseClient,
  params: {
    empresaId: number;
    dataInicio: string;
    dataFim: string;
    status?: string;
    pacienteBusca?: string;
  },
): Promise<NfseFocusConsultaRow[]> {
  const { empresaId, dataInicio, dataFim, status, pacienteBusca = "" } = params;

  const inicioIso = dayStartIsoBr(dataInicio);
  const fimExclusivoIso = nextDayStartIsoBr(dataFim);

  let idsPaciente: number[] | null = null;
  const termo = pacienteBusca.trim();
  if (termo.length >= 2) {
    const { data: pacientes, error } = await buscarPacientesPorNomeEmpresa(
      supabase,
      empresaId,
      termo,
      120,
    );
    if (error) throw new Error(error);
    idsPaciente = pacientes.map((p) => p.id);
    if (idsPaciente.length === 0) return [];
  }

  let q = supabase
    .from("nfse_focus_emissoes")
    .select(
      `
        id,
        id_agendamento,
        id_paciente,
        focus_ref,
        status,
        numero_nfse,
        codigo_verificacao,
        numero_rps,
        serie_rps,
        valor_servicos,
        discriminacao,
        url_danfse,
        error_message,
        created_at,
        emitted_at,
        pacientes ( nome_completo, nome_social ),
        agendamentos ( data_hora_inicio )
      `,
    )
    .eq("id_empresa", empresaId)
    .gte("created_at", inicioIso)
    .lt("created_at", fimExclusivoIso);

  if (status?.trim()) {
    q = q.eq("status", status.trim());
  }

  if (idsPaciente) {
    q = q.in("id_paciente", idsPaciente);
  }

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  return (data ?? []).map((raw) => {
    const pacRaw = raw.pacientes as
      | { nome_completo: string | null; nome_social: string | null }
      | { nome_completo: string | null; nome_social: string | null }[]
      | null;
    const pac = Array.isArray(pacRaw) ? pacRaw[0] : pacRaw;

    const agRaw = raw.agendamentos as
      | { data_hora_inicio: string | null }
      | { data_hora_inicio: string | null }[]
      | null;
    const ag = Array.isArray(agRaw) ? agRaw[0] : agRaw;

    return {
      id: raw.id as string,
      id_agendamento: raw.id_agendamento as number,
      id_paciente: raw.id_paciente as number,
      focus_ref: raw.focus_ref as string,
      status: String(raw.status),
      numero_nfse: raw.numero_nfse as string | null,
      codigo_verificacao: raw.codigo_verificacao as string | null,
      numero_rps: raw.numero_rps as string | null,
      serie_rps: raw.serie_rps as string | null,
      valor_servicos: Number(raw.valor_servicos),
      discriminacao: String(raw.discriminacao),
      url_danfse: raw.url_danfse as string | null,
      error_message: raw.error_message as string | null,
      created_at: raw.created_at as string,
      emitted_at: raw.emitted_at as string | null,
      paciente_nome: nomePaciente(pac),
      data_hora_atendimento: ag?.data_hora_inicio ?? null,
    };
  });
}

/** Status retornados pela Focus NFe para filtro na consulta. */
export const STATUS_NFSE_FOCUS_FILTRO = [
  { value: "", label: "Todos" },
  { value: "processando_autorizacao", label: "Processando autorização" },
  { value: "autorizado", label: "Autorizado" },
  { value: "erro_autorizacao", label: "Erro na autorização" },
  { value: "cancelado", label: "Cancelado" },
] as const;
