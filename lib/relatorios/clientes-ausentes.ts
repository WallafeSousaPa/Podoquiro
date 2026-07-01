import type { SupabaseClient } from "@supabase/supabase-js";
import { nomeExibicaoPaciente, normalizeCpfDigits } from "@/lib/pacientes";
import { DATA_YMD_RE, diasEntreYmd, validarPeriodoRelatorio } from "@/lib/relatorios/periodo";

export type ClienteAusenteRow = {
  id_paciente: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  ativo: boolean;
  ultimo_atendimento: string | null;
  dias_ausente: number | null;
  profissional_ultimo: string | null;
  total_atendimentos: number;
};

export type ClientesAusentesData = {
  filtros: {
    data_referencia: string;
    dias_minimos: number;
    ultimo_atendimento_de: string | null;
    ultimo_atendimento_ate: string | null;
    somente_ativos: boolean;
    incluir_sem_atendimento: boolean;
    busca: string | null;
  };
  resumo: {
    total_pacientes_considerados: number;
    total_ausentes: number;
    media_dias_ausente: number;
    nunca_atendidos: number;
  };
  pacientes: ClienteAusenteRow[];
};

type UsuarioEmbed = { nome_completo?: string | null; usuario?: string | null };

function nomeProfissional(u: UsuarioEmbed | null): string {
  if (!u) return "Profissional";
  return u.nome_completo?.trim() || u.usuario?.trim() || "Profissional";
}

function extrairUsuario(raw: UsuarioEmbed | UsuarioEmbed[] | null): UsuarioEmbed | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function ymdBrFromIso(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function calcularDiasAusente(ultimoIso: string, dataReferencia: string): number {
  const ymdUltimo = ymdBrFromIso(ultimoIso);
  if (!ymdUltimo) return 0;
  const dias = diasEntreYmd(ymdUltimo, dataReferencia);
  return Number.isFinite(dias) ? Math.max(0, dias) : 0;
}

function pacienteCombinaBusca(
  row: {
    nome_completo: string | null;
    nome_social: string | null;
    cpf: string | null;
    telefone: string | null;
  },
  busca: string,
): boolean {
  const term = busca.trim().toLowerCase();
  if (!term) return true;
  const nome = nomeExibicaoPaciente(row).toLowerCase();
  const cpf = normalizeCpfDigits(row.cpf);
  const tel = (row.telefone ?? "").replace(/\D/g, "");
  const termDigits = term.replace(/\D/g, "");
  if (nome.includes(term)) return true;
  if (termDigits && cpf.includes(termDigits)) return true;
  if (termDigits && tel.includes(termDigits)) return true;
  return false;
}

export function validarFiltrosClientesAusentes(input: {
  dataReferencia: string;
  diasMinimos: number;
  ultimoAtendimentoDe: string;
  ultimoAtendimentoAte: string;
}): string | null {
  if (!DATA_YMD_RE.test(input.dataReferencia)) {
    return "Informe data_referencia (YYYY-MM-DD).";
  }
  if (!Number.isFinite(input.diasMinimos) || input.diasMinimos < 0) {
    return "dias_minimos deve ser um número maior ou igual a zero.";
  }
  const de = input.ultimoAtendimentoDe.trim();
  const ate = input.ultimoAtendimentoAte.trim();
  if (de && !DATA_YMD_RE.test(de)) {
    return "ultimo_atendimento_de inválido (YYYY-MM-DD).";
  }
  if (ate && !DATA_YMD_RE.test(ate)) {
    return "ultimo_atendimento_ate inválido (YYYY-MM-DD).";
  }
  if (de && ate) {
    return validarPeriodoRelatorio(de, ate);
  }
  if (de && !ate) {
    return "Informe ultimo_atendimento_ate ao usar ultimo_atendimento_de.";
  }
  if (!de && ate) {
    return "Informe ultimo_atendimento_de ao usar ultimo_atendimento_ate.";
  }
  return null;
}

export async function gerarRelatorioClientesAusentes(
  supabase: SupabaseClient,
  opts: {
    idEmpresa: number;
    dataReferencia: string;
    diasMinimos: number;
    ultimoAtendimentoDe: string | null;
    ultimoAtendimentoAte: string | null;
    somenteAtivos: boolean;
    incluirSemAtendimento: boolean;
    busca: string | null;
  },
): Promise<ClientesAusentesData> {
  let queryPacientes = supabase
    .from("pacientes")
    .select("id, cpf, nome_completo, nome_social, telefone, ativo")
    .eq("id_empresa", opts.idEmpresa);

  if (opts.somenteAtivos) {
    queryPacientes = queryPacientes.eq("ativo", true);
  }

  const { data: pacientesRaw, error: pErr } = await queryPacientes;
  if (pErr) throw new Error(pErr.message);

  const { data: agendamentosRaw, error: aErr } = await supabase
    .from("agendamentos")
    .select("id_paciente, data_hora_inicio, usuarios ( nome_completo, usuario )")
    .eq("id_empresa", opts.idEmpresa)
    .eq("status", "realizado")
    .order("data_hora_inicio", { ascending: false });

  if (aErr) throw new Error(aErr.message);

  type UltimoAg = {
    data_hora_inicio: string;
    profissional: string;
  };

  const ultimoPorPaciente = new Map<number, UltimoAg>();
  const totalPorPaciente = new Map<number, number>();

  for (const ag of agendamentosRaw ?? []) {
    const idPac = ag.id_paciente as number;
    totalPorPaciente.set(idPac, (totalPorPaciente.get(idPac) ?? 0) + 1);
    if (!ultimoPorPaciente.has(idPac)) {
      const u = extrairUsuario(
        ag.usuarios as UsuarioEmbed | UsuarioEmbed[] | null,
      );
      ultimoPorPaciente.set(idPac, {
        data_hora_inicio: String(ag.data_hora_inicio),
        profissional: nomeProfissional(u),
      });
    }
  }

  const pacientesFiltrados = (pacientesRaw ?? []).filter((p) =>
    pacienteCombinaBusca(p, opts.busca ?? ""),
  );

  const rows: ClienteAusenteRow[] = [];

  for (const p of pacientesFiltrados) {
    const ultimo = ultimoPorPaciente.get(p.id as number);
    const nome = nomeExibicaoPaciente(p).trim() || `Paciente #${p.id}`;
    const totalAtendimentos = totalPorPaciente.get(p.id as number) ?? 0;

    if (!ultimo) {
      if (!opts.incluirSemAtendimento) continue;
      rows.push({
        id_paciente: p.id as number,
        nome,
        cpf: p.cpf?.trim() || null,
        telefone: p.telefone?.trim() || null,
        ativo: Boolean(p.ativo),
        ultimo_atendimento: null,
        dias_ausente: null,
        profissional_ultimo: null,
        total_atendimentos: 0,
      });
      continue;
    }

    const ymdUltimo = ymdBrFromIso(ultimo.data_hora_inicio);
    if (opts.ultimoAtendimentoDe && ymdUltimo) {
      if (ymdUltimo < opts.ultimoAtendimentoDe) continue;
    }
    if (opts.ultimoAtendimentoAte && ymdUltimo) {
      if (ymdUltimo > opts.ultimoAtendimentoAte) continue;
    }

    const diasAusente = calcularDiasAusente(ultimo.data_hora_inicio, opts.dataReferencia);
    if (diasAusente < opts.diasMinimos) continue;

    rows.push({
      id_paciente: p.id as number,
      nome,
      cpf: p.cpf?.trim() || null,
      telefone: p.telefone?.trim() || null,
      ativo: Boolean(p.ativo),
      ultimo_atendimento: ultimo.data_hora_inicio,
      dias_ausente: diasAusente,
      profissional_ultimo: ultimo.profissional,
      total_atendimentos: totalAtendimentos,
    });
  }

  rows.sort((a, b) => {
    const da = a.dias_ausente ?? Number.MAX_SAFE_INTEGER;
    const db = b.dias_ausente ?? Number.MAX_SAFE_INTEGER;
    if (db !== da) return db - da;
    return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
  });

  const comDias = rows.filter((r) => r.dias_ausente != null);
  const mediaDias =
    comDias.length > 0
      ? Math.round(comDias.reduce((s, r) => s + (r.dias_ausente ?? 0), 0) / comDias.length)
      : 0;

  return {
    filtros: {
      data_referencia: opts.dataReferencia,
      dias_minimos: opts.diasMinimos,
      ultimo_atendimento_de: opts.ultimoAtendimentoDe,
      ultimo_atendimento_ate: opts.ultimoAtendimentoAte,
      somente_ativos: opts.somenteAtivos,
      incluir_sem_atendimento: opts.incluirSemAtendimento,
      busca: opts.busca?.trim() || null,
    },
    resumo: {
      total_pacientes_considerados: pacientesFiltrados.length,
      total_ausentes: rows.length,
      media_dias_ausente: mediaDias,
      nunca_atendidos: rows.filter((r) => r.ultimo_atendimento == null).length,
    },
    pacientes: rows,
  };
}
