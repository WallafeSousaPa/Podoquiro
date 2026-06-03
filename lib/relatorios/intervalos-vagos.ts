import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatMinutosParaHora,
  parseHoraParaMinutos,
} from "@/lib/agenda/expediente-tempo";
import { statusAgendaOcupacaoSlot } from "@/lib/agenda/validacao-agendamento";
import { dayStartIsoBr, nextDayStartIsoBr } from "@/lib/relatorios/periodo";

/** Lacuna (intervalo vago) entre atendimentos dentro da janela disponível. */
export type LacunaIntervalo = {
  inicio: string;
  fim: string;
  minutos: number;
};

export type IntervaloVagoDia = {
  data: string;
  horario_inicio: string;
  horario_fim: string;
  /** Janela disponível = expediente − intervalo − bloqueio (em minutos). */
  minutos_janela: number;
  minutos_atendido: number;
  minutos_vago: number;
  qtd_agendamentos: number;
  lacunas: LacunaIntervalo[];
};

export type IntervaloVagoPorPodologo = {
  id_usuario: number;
  nome: string;
  sem_expediente: boolean;
  dias_considerados: number;
  minutos_janela_total: number;
  minutos_atendido_total: number;
  minutos_vago_total: number;
  media_vago_dia: number;
  ocupacao_percentual: number;
  dias: IntervaloVagoDia[];
};

export type IntervalosVagosData = {
  periodo: { data_inicio: string; data_fim: string };
  resumo: {
    podologos_considerados: number;
    podologos_sem_expediente: number;
    dias_considerados: number;
    minutos_janela_total: number;
    minutos_atendido_total: number;
    minutos_vago_total: number;
  };
  por_podologo: IntervaloVagoPorPodologo[];
};

type Intervalo = { inicio: number; fim: number };

type UsuarioEmbed = { nome_completo?: string | null; usuario?: string | null };

function nomeProfissional(u: UsuarioEmbed | null): string {
  if (!u) return "Profissional não informado";
  return u.nome_completo?.trim() || u.usuario?.trim() || "Profissional não informado";
}

function extrairUsuario(raw: UsuarioEmbed | UsuarioEmbed[] | null): UsuarioEmbed | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

/** Data (YYYY-MM-DD) e minutos desde a meia-noite no fuso de São Paulo. */
function tempoBrasilia(iso: string): { ymd: string; minutos: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hh = get("hour");
  if (hh === "24") hh = "00";
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  const minutos = Number(hh) * 60 + Number(get("minute"));
  if (!Number.isFinite(minutos)) return null;
  return { ymd, minutos };
}

/** Une intervalos sobrepostos e devolve em ordem crescente. */
function unirIntervalos(itens: Intervalo[]): Intervalo[] {
  const ordenados = itens
    .filter((i) => i.fim > i.inicio)
    .sort((a, b) => a.inicio - b.inicio);
  const out: Intervalo[] = [];
  for (const it of ordenados) {
    const ultimo = out[out.length - 1];
    if (ultimo && it.inicio <= ultimo.fim) {
      ultimo.fim = Math.max(ultimo.fim, it.fim);
    } else {
      out.push({ ...it });
    }
  }
  return out;
}

/** Clampa um intervalo à janela [ini, fim]; retorna null se não houver interseção. */
function clampar(it: Intervalo, ini: number, fim: number): Intervalo | null {
  const i = Math.max(it.inicio, ini);
  const f = Math.min(it.fim, fim);
  return f > i ? { inicio: i, fim: f } : null;
}

type ExpedienteRow = {
  id_usuario: number;
  horario_inicio: string;
  intervalo_inicio: string | null;
  intervalo_fim: string | null;
  horario_fim: string;
  horario_inicio_bloqueado: string | null;
  horario_fim_bloqueado: string | null;
};

type ExpedienteCalc = {
  inicio: number;
  fim: number;
  indisponiveis: Intervalo[];
};

function montarExpedienteCalc(row: ExpedienteRow): ExpedienteCalc | null {
  const inicio = parseHoraParaMinutos(row.horario_inicio);
  const fim = parseHoraParaMinutos(row.horario_fim);
  if (inicio == null || fim == null || fim <= inicio) return null;

  const indisponiveis: Intervalo[] = [];
  const ii = parseHoraParaMinutos(row.intervalo_inicio);
  const ifim = parseHoraParaMinutos(row.intervalo_fim);
  if (ii != null && ifim != null && ifim > ii) {
    indisponiveis.push({ inicio: ii, fim: ifim });
  }
  const bi = parseHoraParaMinutos(row.horario_inicio_bloqueado);
  const bf = parseHoraParaMinutos(row.horario_fim_bloqueado);
  if (bi != null && bf != null && bf > bi) {
    indisponiveis.push({ inicio: bi, fim: bf });
  }
  return { inicio, fim, indisponiveis };
}

/** Calcula as lacunas (tempo vago) de um dia, dado o expediente e os agendamentos. */
function calcularDia(
  exp: ExpedienteCalc,
  agendamentos: Intervalo[],
): {
  minutos_janela: number;
  minutos_atendido: number;
  minutos_vago: number;
  lacunas: LacunaIntervalo[];
} {
  const { inicio, fim } = exp;

  const indisponiveisClamp = exp.indisponiveis
    .map((i) => clampar(i, inicio, fim))
    .filter((i): i is Intervalo => i != null);
  const indisponivelUniao = unirIntervalos(indisponiveisClamp);
  const minutosIndisponivel = indisponivelUniao.reduce(
    (s, i) => s + (i.fim - i.inicio),
    0,
  );
  const minutosJanela = fim - inicio - minutosIndisponivel;

  const agsClamp = agendamentos
    .map((i) => clampar(i, inicio, fim))
    .filter((i): i is Intervalo => i != null);

  // Atendido = agendamentos, mas fora dos períodos indisponíveis (para não contar 2x).
  const ocupadoUniao = unirIntervalos([...agsClamp, ...indisponivelUniao]);
  const minutosOcupado = ocupadoUniao.reduce((s, i) => s + (i.fim - i.inicio), 0);
  const minutosAtendido = minutosOcupado - minutosIndisponivel;

  // Vago = janela disponível − atendido. Equivale às lacunas livres.
  // Lacunas = trechos de [inicio, fim] que não estão em ocupadoUniao.
  const lacunas: LacunaIntervalo[] = [];
  let cursor = inicio;
  for (const oc of ocupadoUniao) {
    if (oc.inicio > cursor) {
      lacunas.push({
        inicio: formatMinutosParaHora(cursor),
        fim: formatMinutosParaHora(oc.inicio),
        minutos: oc.inicio - cursor,
      });
    }
    cursor = Math.max(cursor, oc.fim);
  }
  if (cursor < fim) {
    lacunas.push({
      inicio: formatMinutosParaHora(cursor),
      fim: formatMinutosParaHora(fim),
      minutos: fim - cursor,
    });
  }

  const minutosVago = lacunas.reduce((s, l) => s + l.minutos, 0);

  return {
    minutos_janela: minutosJanela,
    minutos_atendido: Math.max(0, minutosAtendido),
    minutos_vago: minutosVago,
    lacunas,
  };
}

export async function gerarRelatorioIntervalosVagos(
  supabase: SupabaseClient,
  args: { idEmpresa: number; dataInicio: string; dataFim: string },
): Promise<IntervalosVagosData> {
  const inicioIso = dayStartIsoBr(args.dataInicio);
  const fimExclusivo = nextDayStartIsoBr(args.dataFim);

  const { data: agRows, error: agErr } = await supabase
    .from("agendamentos")
    .select(
      `
      id_usuario,
      status,
      data_hora_inicio,
      data_hora_fim,
      usuarios!inner ( nome_completo, usuario, ativo )
    `,
    )
    .eq("id_empresa", args.idEmpresa)
    .eq("usuarios.ativo", true)
    .gte("data_hora_inicio", inicioIso)
    .lt("data_hora_inicio", fimExclusivo)
    .order("data_hora_inicio", { ascending: true });
  if (agErr) throw new Error(agErr.message);

  // Expedientes da empresa, indexados por id_usuario.
  const { data: expRows, error: expErr } = await supabase
    .from("colaboradores_expedientes")
    .select(
      `
      id_usuario,
      horario_inicio,
      intervalo_inicio,
      intervalo_fim,
      horario_fim,
      horario_inicio_bloqueado,
      horario_fim_bloqueado,
      usuarios!inner ( id_empresa )
    `,
    )
    .eq("usuarios.id_empresa", args.idEmpresa);
  if (expErr) throw new Error(expErr.message);

  const expedientePorUsuario = new Map<number, ExpedienteCalc>();
  for (const r of expRows ?? []) {
    const calc = montarExpedienteCalc(r as unknown as ExpedienteRow);
    if (calc) expedientePorUsuario.set(r.id_usuario as number, calc);
  }

  // Agrupa agendamentos que ocupam o slot por (usuário, dia).
  type Bucket = {
    id_usuario: number;
    nome: string;
    ags: Intervalo[];
  };
  const porUsuarioDia = new Map<string, Bucket>();
  const nomePorUsuario = new Map<number, string>();

  for (const row of agRows ?? []) {
    const status = String(row.status ?? "");
    if (!statusAgendaOcupacaoSlot(status)) continue;

    const idUser = row.id_usuario as number;
    const tIni = tempoBrasilia(String(row.data_hora_inicio));
    const tFim = tempoBrasilia(String(row.data_hora_fim));
    if (!tIni) continue;
    // Fim no mesmo dia: usa minutos do fim se for o mesmo dia; senão fecha no fim do dia (1440).
    const fimMin =
      tFim && tFim.ymd === tIni.ymd ? tFim.minutos : 24 * 60;
    if (fimMin <= tIni.minutos) continue;

    const nome = nomeProfissional(extrairUsuario(row.usuarios as never));
    nomePorUsuario.set(idUser, nome);

    const chave = `${idUser}|${tIni.ymd}`;
    const bucket = porUsuarioDia.get(chave) ?? {
      id_usuario: idUser,
      nome,
      ags: [],
    };
    bucket.ags.push({ inicio: tIni.minutos, fim: fimMin });
    porUsuarioDia.set(chave, bucket);
  }

  type Acc = {
    id_usuario: number;
    nome: string;
    sem_expediente: boolean;
    dias: IntervaloVagoDia[];
  };
  const porPodologo = new Map<number, Acc>();

  for (const [chave, bucket] of porUsuarioDia.entries()) {
    const data = chave.split("|")[1]!;
    const exp = expedientePorUsuario.get(bucket.id_usuario);

    const acc =
      porPodologo.get(bucket.id_usuario) ?? {
        id_usuario: bucket.id_usuario,
        nome: bucket.nome,
        sem_expediente: !exp,
        dias: [],
      };

    if (!exp) {
      acc.sem_expediente = true;
      acc.dias.push({
        data,
        horario_inicio: "—",
        horario_fim: "—",
        minutos_janela: 0,
        minutos_atendido: 0,
        minutos_vago: 0,
        qtd_agendamentos: bucket.ags.length,
        lacunas: [],
      });
    } else {
      const calc = calcularDia(exp, bucket.ags);
      acc.dias.push({
        data,
        horario_inicio: formatMinutosParaHora(exp.inicio),
        horario_fim: formatMinutosParaHora(exp.fim),
        minutos_janela: calc.minutos_janela,
        minutos_atendido: calc.minutos_atendido,
        minutos_vago: calc.minutos_vago,
        qtd_agendamentos: bucket.ags.length,
        lacunas: calc.lacunas,
      });
    }
    porPodologo.set(bucket.id_usuario, acc);
  }

  const por_podologo: IntervaloVagoPorPodologo[] = [...porPodologo.values()].map(
    (acc) => {
      const dias = acc.dias.sort((a, b) => a.data.localeCompare(b.data));
      const diasComExpediente = acc.sem_expediente
        ? []
        : dias.filter((d) => d.minutos_janela > 0 || d.minutos_atendido > 0);
      const minutosJanelaTotal = diasComExpediente.reduce(
        (s, d) => s + d.minutos_janela,
        0,
      );
      const minutosAtendidoTotal = diasComExpediente.reduce(
        (s, d) => s + d.minutos_atendido,
        0,
      );
      const minutosVagoTotal = diasComExpediente.reduce(
        (s, d) => s + d.minutos_vago,
        0,
      );
      const diasConsiderados = diasComExpediente.length;
      return {
        id_usuario: acc.id_usuario,
        nome: acc.nome,
        sem_expediente: acc.sem_expediente,
        dias_considerados: diasConsiderados,
        minutos_janela_total: minutosJanelaTotal,
        minutos_atendido_total: minutosAtendidoTotal,
        minutos_vago_total: minutosVagoTotal,
        media_vago_dia:
          diasConsiderados > 0
            ? Math.round(minutosVagoTotal / diasConsiderados)
            : 0,
        ocupacao_percentual:
          minutosJanelaTotal > 0
            ? Math.round((minutosAtendidoTotal / minutosJanelaTotal) * 1000) / 10
            : 0,
        dias,
      };
    },
  );

  por_podologo.sort((a, b) => b.minutos_vago_total - a.minutos_vago_total);

  const resumo = {
    podologos_considerados: por_podologo.filter((p) => !p.sem_expediente).length,
    podologos_sem_expediente: por_podologo.filter((p) => p.sem_expediente).length,
    dias_considerados: por_podologo.reduce((s, p) => s + p.dias_considerados, 0),
    minutos_janela_total: por_podologo.reduce(
      (s, p) => s + p.minutos_janela_total,
      0,
    ),
    minutos_atendido_total: por_podologo.reduce(
      (s, p) => s + p.minutos_atendido_total,
      0,
    ),
    minutos_vago_total: por_podologo.reduce((s, p) => s + p.minutos_vago_total, 0),
  };

  return {
    periodo: { data_inicio: args.dataInicio, data_fim: args.dataFim },
    resumo,
    por_podologo,
  };
}
