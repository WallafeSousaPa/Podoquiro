import type { SupabaseClient } from "@supabase/supabase-js";

/** Valor válido guardado na empresa (> 0 inteiro); null = política desligada. */
export function diasEntreAnamnesesDoValorDb(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i <= 0) return null;
  return i;
}

/** YYYY-MM-DD no fuso America/Sao_Paulo (datas corridas brasileiras). */
export function dataYmdAmericaSaoPaulo(d = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function diffDiasCalendario(ymdDepois: string, ymdAntes: string): number {
  const [ya, ma, da] = ymdAntes.split("-").map(Number);
  const [yb, mb, db] = ymdDepois.split("-").map(Number);
  const t0 = Date.UTC(ya, ma - 1, da);
  const t1 = Date.UTC(yb, mb - 1, db);
  return Math.floor((t1 - t0) / 86_400_000);
}

export function dataIsoParaYmdBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const s = iso.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return dataYmdAmericaSaoPaulo();
  }
  return dataYmdAmericaSaoPaulo(d);
}

export function permiteNovaAnamneseCronologica(args: {
  diasMinimos: number | null;
  /** Data/hora ISO da última evolução ativa ou null se nunca houve. */
  dataUltimaIso: string | null;
  hojeBrYmd?: string;
}): {
  permite: boolean;
  diasPassados?: number;
  diasRestantes?: number;
  dataUltimaBr?: string;
  diasPolitica?: number;
} {
  const diasPolitica =
    args.diasMinimos != null &&
    Number.isFinite(args.diasMinimos) &&
    args.diasMinimos > 0
      ? Math.trunc(args.diasMinimos)
      : null;
  if (diasPolitica == null) {
    return { permite: true };
  }
  if (args.dataUltimaIso == null || !String(args.dataUltimaIso).trim()) {
    return { permite: true, diasPolitica };
  }

  const hoje = args.hojeBrYmd ?? dataYmdAmericaSaoPaulo();
  const ultimaBr = dataIsoParaYmdBr(String(args.dataUltimaIso));
  const diasPassados = Math.max(0, diffDiasCalendario(hoje, ultimaBr));
  if (diasPassados >= diasPolitica) {
    return { permite: true, diasPassados, dataUltimaBr: ultimaBr, diasPolitica };
  }
  return {
    permite: false,
    diasPassados,
    diasRestantes: diasPolitica - diasPassados,
    dataUltimaBr: ultimaBr,
    diasPolitica,
  };
}

export function textoBloqueioAnamneseIntervalo(
  r: {
    diasRestantes: number;
    diasPolitica: number;
    dataUltimaBr: string;
  },
  assunto = "anamnese",
): string {
  const [y, m, d] = r.dataUltimaBr.split("-");
  const exibir = d && m && y ? `${d}/${m}/${y}` : r.dataUltimaBr;
  return (
    `Intervalo da clínica: nova ${assunto} após ${r.diasPolitica} dia(s) da última ficha. ` +
    `Última: ${exibir}. Faltam ${r.diasRestantes} dia(s).`
  );
}

export type GateAnamneseAgendamento = {
  anamnese_bloqueada: boolean;
  anamnese_bloqueio_texto: string | null;
};

type FonteGateAnamnese = {
  colunaDias: "dias_entre_anamneses" | "dias_entre_anamneses_enfermagem";
  tabela: "pacientes_evolucao" | "pacientes_ficha_enfermagem";
  colunaData: "data" | "updated_at";
  assunto: string;
  filtrarEmpresa: boolean;
};

const FONTE_ANAMNESE_PODOLOGO: FonteGateAnamnese = {
  colunaDias: "dias_entre_anamneses",
  tabela: "pacientes_evolucao",
  colunaData: "data",
  assunto: "anamnese",
  filtrarEmpresa: false,
};

const FONTE_ANAMNESE_ENFERMAGEM: FonteGateAnamnese = {
  colunaDias: "dias_entre_anamneses_enfermagem",
  tabela: "pacientes_ficha_enfermagem",
  colunaData: "updated_at",
  assunto: "avaliação de enfermagem",
  filtrarEmpresa: true,
};

export async function carregarGatesAnamnesePorPaciente(
  supabase: SupabaseClient,
  empresaId: number,
  idsPacientes: number[],
  fonte: FonteGateAnamnese = FONTE_ANAMNESE_PODOLOGO,
): Promise<Record<number, GateAnamneseAgendamento>> {
  const unicos = [...new Set(idsPacientes.filter((x) => Number.isFinite(x) && x > 0))];
  const vazio: Record<number, GateAnamneseAgendamento> = {};
  if (unicos.length === 0) return vazio;

  const { data: emp, error: eEmp } = await supabase
    .from("empresas")
    .select(fonte.colunaDias)
    .eq("id", empresaId)
    .maybeSingle();
  if (eEmp) throw new Error(eEmp.message);

  const diasPolitica = diasEntreAnamnesesDoValorDb(
    (emp as Record<string, unknown> | null)?.[fonte.colunaDias],
  );
  const hojeBr = dataYmdAmericaSaoPaulo();
  if (diasPolitica == null) {
    return Object.fromEntries(
      unicos.map((id) => [id, { anamnese_bloqueada: false, anamnese_bloqueio_texto: null }]),
    );
  }

  let consulta = supabase
    .from(fonte.tabela)
    .select(`id_paciente, ${fonte.colunaData}`)
    .in("id_paciente", unicos)
    .order(fonte.colunaData, { ascending: false });
  if (fonte.tabela === "pacientes_evolucao") consulta = consulta.eq("ativo", true);
  if (fonte.filtrarEmpresa) consulta = consulta.eq("id_empresa", empresaId);
  const { data: evoRows, error: eEvo } = await consulta;
  if (eEvo) throw new Error(eEvo.message);

  const ultimaIsoPorPaciente = new Map<number, string>();
  for (const row of evoRows ?? []) {
    const pid = Number(row.id_paciente);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    if (ultimaIsoPorPaciente.has(pid)) continue;
    const raw = (row as Record<string, unknown>)[fonte.colunaData];
    if (raw == null) continue;
    ultimaIsoPorPaciente.set(pid, String(raw));
  }

  const out: Record<number, GateAnamneseAgendamento> = {};
  for (const pid of unicos) {
    const ult = ultimaIsoPorPaciente.get(pid) ?? null;
    const r = permiteNovaAnamneseCronologica({
      diasMinimos: diasPolitica,
      dataUltimaIso: ult,
      hojeBrYmd: hojeBr,
    });
    if (r.permite) {
      out[pid] = { anamnese_bloqueada: false, anamnese_bloqueio_texto: null };
    } else if (r.diasRestantes != null && r.diasPolitica != null && r.dataUltimaBr != null) {
      out[pid] = {
        anamnese_bloqueada: true,
        anamnese_bloqueio_texto: textoBloqueioAnamneseIntervalo(
          {
            diasRestantes: r.diasRestantes,
            diasPolitica: r.diasPolitica,
            dataUltimaBr: r.dataUltimaBr,
          },
          fonte.assunto,
        ),
      };
    } else {
      out[pid] = { anamnese_bloqueada: false, anamnese_bloqueio_texto: null };
    }
  }
  return out;
}

export type GatesAnamneseAgendamento = GateAnamneseAgendamento & {
  anamnese_enfermagem_bloqueada: boolean;
  anamnese_enfermagem_bloqueio_texto: string | null;
};

/** Gates do podólogo e da enfermagem, por id de agendamento. Ficha já salva neste atendimento não bloqueia a enfermagem. */
export async function carregarGatesAnamneseDosAgendamentos(
  supabase: SupabaseClient,
  empresaId: number,
  agendamentos: { id: number; id_paciente: number }[],
): Promise<Record<number, GatesAnamneseAgendamento>> {
  const idsAg = [...new Set(agendamentos.map((a) => a.id).filter((n) => Number.isFinite(n) && n > 0))];
  const idsPac = agendamentos.map((a) => a.id_paciente);
  const [pod, enf, fichasRes] = await Promise.all([
    carregarGatesAnamnesePorPaciente(supabase, empresaId, idsPac, FONTE_ANAMNESE_PODOLOGO),
    carregarGatesAnamnesePorPaciente(supabase, empresaId, idsPac, FONTE_ANAMNESE_ENFERMAGEM),
    idsAg.length === 0
      ? Promise.resolve({ data: [] as { id_agendamento: number }[], error: null })
      : supabase
          .from("pacientes_ficha_enfermagem")
          .select("id_agendamento")
          .eq("id_empresa", empresaId)
          .in("id_agendamento", idsAg),
  ]);
  if (fichasRes.error) throw new Error(fichasRes.error.message);
  const comFicha = new Set(
    (fichasRes.data ?? []).map((r) => Number(r.id_agendamento)).filter((n) => Number.isFinite(n)),
  );
  const livre: GateAnamneseAgendamento = {
    anamnese_bloqueada: false,
    anamnese_bloqueio_texto: null,
  };
  const out: Record<number, GatesAnamneseAgendamento> = {};
  for (const ag of agendamentos) {
    const p = pod[ag.id_paciente] ?? livre;
    const e = enf[ag.id_paciente] ?? livre;
    const temFicha = comFicha.has(ag.id);
    out[ag.id] = {
      anamnese_bloqueada: p.anamnese_bloqueada,
      anamnese_bloqueio_texto: p.anamnese_bloqueio_texto,
      anamnese_enfermagem_bloqueada: temFicha ? false : e.anamnese_bloqueada,
      anamnese_enfermagem_bloqueio_texto: temFicha ? null : e.anamnese_bloqueio_texto,
    };
  }
  return out;
}
