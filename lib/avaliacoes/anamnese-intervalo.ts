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

export function textoBloqueioAnamneseIntervalo(r: {
  diasRestantes: number;
  diasPolitica: number;
  dataUltimaBr: string;
}): string {
  const [y, m, d] = r.dataUltimaBr.split("-");
  const exibir = d && m && y ? `${d}/${m}/${y}` : r.dataUltimaBr;
  return (
    `Intervalo da clínica: nova anamnese após ${r.diasPolitica} dia(s) da última ficha. ` +
    `Última: ${exibir}. Faltam ${r.diasRestantes} dia(s).`
  );
}

export type GateAnamneseAgendamento = {
  anamnese_bloqueada: boolean;
  anamnese_bloqueio_texto: string | null;
};

export async function carregarGatesAnamnesePorPaciente(
  supabase: SupabaseClient,
  empresaId: number,
  idsPacientes: number[],
): Promise<Record<number, GateAnamneseAgendamento>> {
  const unicos = [...new Set(idsPacientes.filter((x) => Number.isFinite(x) && x > 0))];
  const vazio: Record<number, GateAnamneseAgendamento> = {};
  if (unicos.length === 0) return vazio;

  const { data: emp, error: eEmp } = await supabase
    .from("empresas")
    .select("dias_entre_anamneses")
    .eq("id", empresaId)
    .maybeSingle();
  if (eEmp) throw new Error(eEmp.message);

  const diasPolitica = diasEntreAnamnesesDoValorDb(emp?.dias_entre_anamneses);
  const hojeBr = dataYmdAmericaSaoPaulo();
  if (diasPolitica == null) {
    return Object.fromEntries(
      unicos.map((id) => [id, { anamnese_bloqueada: false, anamnese_bloqueio_texto: null }]),
    );
  }

  const { data: evoRows, error: eEvo } = await supabase
    .from("pacientes_evolucao")
    .select("id_paciente, data")
    .in("id_paciente", unicos)
    .eq("ativo", true)
    .order("data", { ascending: false });
  if (eEvo) throw new Error(eEvo.message);

  const ultimaIsoPorPaciente = new Map<number, string>();
  for (const row of evoRows ?? []) {
    const pid = Number(row.id_paciente);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    if (ultimaIsoPorPaciente.has(pid)) continue;
    const raw = row.data;
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
        anamnese_bloqueio_texto: textoBloqueioAnamneseIntervalo({
          diasRestantes: r.diasRestantes,
          diasPolitica: r.diasPolitica,
          dataUltimaBr: r.dataUltimaBr,
        }),
      };
    } else {
      out[pid] = { anamnese_bloqueada: false, anamnese_bloqueio_texto: null };
    }
  }
  return out;
}
