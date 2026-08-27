import type { SupabaseClient } from "@supabase/supabase-js";
import { escapePadraoIlike } from "@/lib/pacientes/buscar-pacientes-nome-empresa";
import {
  type TipoTratamentoPonto,
  ehTipoTratamentoPonto,
} from "@/lib/ponto/tratamentos";
import {
  calcularHorasTrabalhadasDia,
} from "@/lib/ponto/horas-trabalhadas";
import { dayStartIsoBr, nextDayStartIsoBr } from "@/lib/relatorios/periodo";

const TZ_PONTO = "America/Sao_Paulo";
const LIMITE_REGISTROS = 4000;

export type TratamentoPontoResumo = {
  id: number;
  tipo_alteracao: TipoTratamentoPonto;
  motivo: string;
  data_hora_processamento: string;
  responsavel: string | null;
};

export type MarcacaoPonto = {
  id: number | null;
  nsr: number | null;
  empregador_id: number;
  data_hora_fato: string;
  data_hora_original: string | null;
  fuso_horario: string;
  tipo_batida: string;
  metodo_validacao: string | null;
  dispositivo_id: string | null;
  score_precisao: number | null;
  desconsiderada: boolean;
  origem: "ORIGINAL" | "INCLUSAO" | "CORRECAO_HORARIO";
  tratamento: TratamentoPontoResumo | null;
};

export type DiaPontoFuncionario = {
  data: string;
  marcacoes: MarcacaoPonto[];
  horas_trabalhadas_minutos: number;
  em_aberto: boolean;
};

export type FuncionarioPontoConsulta = {
  funcionario_id: number;
  empregador_id: number;
  nome: string;
  cpf: string;
  cargo: string | null;
  empresa: string | null;
  ativo: boolean;
  dias: DiaPontoFuncionario[];
};

export type FuncionarioPontoOpcao = {
  id: number;
  nome: string;
  empregador_id: number;
  empresa: string | null;
  ativo: boolean;
};

export type ConsultaPontoData = {
  periodo: { data_inicio: string; data_fim: string };
  resumo: {
    funcionarios: number;
    marcacoes: number;
    dias_com_ponto: number;
    horas_trabalhadas_minutos: number;
  };
  funcionarios: FuncionarioPontoConsulta[];
  funcionarios_opcoes: FuncionarioPontoOpcao[];
};

type FuncionarioJoin = {
  id: number;
  nome: string;
  cpf: string;
  ativo: boolean;
  cargo: number | null;
  empregador_id: number;
  empresa_id: number | null;
};

type RegistroRow = {
  id: number;
  nsr: number;
  empregador_id: number;
  data_hora_fato: string;
  fuso_horario: string;
  tipo_batida: string;
  dispositivo_id: string;
  metodo_validacao: string;
  score_precisao: number | string | null;
  funcionarios: FuncionarioJoin | FuncionarioJoin[] | null;
};

type TratamentoRow = {
  id: number;
  empregador_id: number;
  nsr_referencia: number | null;
  funcionario_id: number;
  data_hora_nova: string;
  tipo_alteracao: string;
  motivo: string;
  usuario_responsavel_id: number;
  data_hora_processamento: string;
  funcionarios: FuncionarioJoin | FuncionarioJoin[] | null;
};

function um<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function ymdEmSaoPaulo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_PONTO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function nomeEmpresaDeRow(row: {
  nome_fantasia?: string | null;
  razao_social?: string | null;
}): string | null {
  const fantasia = String(row.nome_fantasia ?? "").trim();
  if (fantasia) return fantasia;
  const razao = String(row.razao_social ?? "").trim();
  return razao || null;
}

async function nomesEmpresaPorId(
  supabase: SupabaseClient,
  ids: number[],
): Promise<Map<number, string>> {
  const unicos = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  const mapa = new Map<number, string>();
  if (unicos.length === 0) return mapa;
  const { data, error } = await supabase
    .from("empresas")
    .select("id, nome_fantasia, razao_social")
    .in("id", unicos);
  if (error) throw new Error(error.message);
  for (const e of data ?? []) {
    const nome = nomeEmpresaDeRow(e);
    if (nome) mapa.set(Number(e.id), nome);
  }
  return mapa;
}

function scoreNumero(v: number | string | null): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function chaveNsr(empregadorId: number, nsr: number) {
  return `${empregadorId}:${nsr}`;
}

export function consultaPontoVazia(
  dataInicio: string,
  dataFim: string,
  funcionariosOpcoes: FuncionarioPontoOpcao[] = [],
): ConsultaPontoData {
  return {
    periodo: { data_inicio: dataInicio, data_fim: dataFim },
    resumo: {
      funcionarios: 0,
      marcacoes: 0,
      dias_com_ponto: 0,
      horas_trabalhadas_minutos: 0,
    },
    funcionarios: [],
    funcionarios_opcoes: funcionariosOpcoes,
  };
}

async function listarFuncionariosOpcoes(
  supabase: SupabaseClient,
  empresaId: number,
): Promise<FuncionarioPontoOpcao[]> {
  const { data, error } = await supabase
    .from("funcionarios")
    .select("id, nome, empregador_id, empresa_id, ativo")
    .eq("empresa_id", empresaId)
    .order("nome", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const empresaPorId = await nomesEmpresaPorId(
    supabase,
    rows.map((r) => Number(r.empresa_id)),
  );
  return rows
    .map((r) => ({
      id: Number(r.id),
      nome: String(r.nome ?? "").trim() || `Funcionário #${r.id}`,
      empregador_id: Number(r.empregador_id),
      empresa: empresaPorId.get(Number(r.empresa_id)) ?? null,
      ativo: Boolean(r.ativo),
    }))
    .filter((r) => r.id > 0 && r.empregador_id > 0);
}

export async function consultarRegistrosPonto(
  supabase: SupabaseClient,
  params: {
    empresaId: number;
    dataInicio: string;
    dataFim: string;
    funcionario?: string;
  },
): Promise<ConsultaPontoData> {
  const { empresaId, dataInicio, dataFim } = params;
  const termo = params.funcionario?.trim() ?? "";
  const funcionariosOpcoes = await listarFuncionariosOpcoes(supabase, empresaId);

  let idsFuncionario: number[] | null = null;
  if (termo.length >= 2) {
    const { data: funcs, error: errFunc } = await supabase
      .from("funcionarios")
      .select("id")
      .eq("empresa_id", empresaId)
      .ilike("nome", `%${escapePadraoIlike(termo)}%`)
      .limit(200);
    if (errFunc) throw new Error(errFunc.message);
    idsFuncionario = (funcs ?? []).map((r) => Number(r.id)).filter((id) => id > 0);
    if (idsFuncionario.length === 0) {
      return consultaPontoVazia(dataInicio, dataFim, funcionariosOpcoes);
    }
  }

  const inicioIso = dayStartIsoBr(dataInicio);
  const fimExclusivoIso = nextDayStartIsoBr(dataFim);

  let q = supabase
    .from("registros_ponto")
    .select(
      `
        id,
        nsr,
        empregador_id,
        data_hora_fato,
        fuso_horario,
        tipo_batida,
        dispositivo_id,
        metodo_validacao,
        score_precisao,
        funcionarios!inner (
          id,
          nome,
          cpf,
          ativo,
          cargo,
          empregador_id,
          empresa_id
        ),
        empregadores!inner ( empresa_id )
      `,
    )
    .eq("empregadores.empresa_id", empresaId)
    .gte("data_hora_fato", inicioIso)
    .lt("data_hora_fato", fimExclusivoIso)
    .order("data_hora_fato", { ascending: true })
    .limit(LIMITE_REGISTROS);

  if (idsFuncionario) {
    q = q.in("funcionario_id", idsFuncionario);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as RegistroRow[];

  const selectTratamentos = `
        id,
        empregador_id,
        nsr_referencia,
        funcionario_id,
        data_hora_nova,
        tipo_alteracao,
        motivo,
        usuario_responsavel_id,
        data_hora_processamento,
        funcionarios!inner (
          id,
          nome,
          cpf,
          ativo,
          cargo,
          empregador_id,
          empresa_id
        ),
        empregadores!inner ( empresa_id )
      `;

  const baseTratamentos = () => {
    let tq = supabase
      .from("tratamentos_ponto")
      .select(selectTratamentos)
      .eq("empregadores.empresa_id", empresaId)
      .order("data_hora_processamento", { ascending: true })
      .limit(LIMITE_REGISTROS);
    if (idsFuncionario) tq = tq.in("funcionario_id", idsFuncionario);
    return tq;
  };

  const nsrs = [...new Set(rows.map((r) => Number(r.nsr)).filter((n) => n > 0))];
  const consultasTrat = [
    baseTratamentos()
      .gte("data_hora_nova", inicioIso)
      .lt("data_hora_nova", fimExclusivoIso),
  ];
  if (nsrs.length > 0) {
    consultasTrat.push(baseTratamentos().in("nsr_referencia", nsrs));
  }

  const tratamentosRes = await Promise.all(consultasTrat);
  const tratamentosPorId = new Map<number, TratamentoRow>();
  for (const res of tratamentosRes) {
    if (res.error) throw new Error(res.error.message);
    for (const raw of (res.data ?? []) as TratamentoRow[]) {
      if (!ehTipoTratamentoPonto(raw.tipo_alteracao)) continue;
      tratamentosPorId.set(Number(raw.id), raw);
    }
  }
  const tratamentos = [...tratamentosPorId.values()].sort((a, b) =>
    a.data_hora_processamento.localeCompare(b.data_hora_processamento),
  );

  const cargoIds = [
    ...new Set(
      [
        ...rows.map((r) => Number(um(r.funcionarios)?.cargo)),
        ...tratamentos.map((t) => Number(um(t.funcionarios)?.cargo)),
      ].filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  const cargoPorId = new Map<number, string>();
  if (cargoIds.length > 0) {
    const { data: cargos, error: errCargo } = await supabase
      .from("funcionarios_cargos")
      .select("id, ocupacao")
      .in("id", cargoIds);
    if (errCargo) throw new Error(errCargo.message);
    for (const c of cargos ?? []) {
      const ocupacao = String(c.ocupacao ?? "").trim();
      if (ocupacao) cargoPorId.set(Number(c.id), ocupacao);
    }
  }

  const responsavelIds = [
    ...new Set(
      tratamentos
        .map((t) => Number(t.usuario_responsavel_id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  const nomeResponsavel = new Map<number, string>();
  if (responsavelIds.length > 0) {
    const { data: users, error: errUsers } = await supabase
      .from("usuarios")
      .select("id, nome_completo, usuario")
      .in("id", responsavelIds);
    if (errUsers) throw new Error(errUsers.message);
    for (const u of users ?? []) {
      const nome =
        String(u.nome_completo ?? "").trim() || String(u.usuario ?? "").trim();
      if (nome) nomeResponsavel.set(Number(u.id), nome);
    }
  }

  type FuncInfo = {
    funcionario_id: number;
    empregador_id: number;
    nome: string;
    cpf: string;
    cargo: string | null;
    empresa: string | null;
    ativo: boolean;
  };

  const empresaPorId = await nomesEmpresaPorId(supabase, [
    ...rows.map((r) => Number(um(r.funcionarios)?.empresa_id)),
    ...tratamentos.map((t) => Number(um(t.funcionarios)?.empresa_id)),
  ]);

  const funcInfo = new Map<number, FuncInfo>();
  const garantirFunc = (f: FuncionarioJoin | null) => {
    if (!f) return;
    if (funcInfo.has(f.id)) return;
    funcInfo.set(f.id, {
      funcionario_id: f.id,
      empregador_id: Number(f.empregador_id),
      nome: String(f.nome ?? "").trim() || `Funcionário #${f.id}`,
      cpf: String(f.cpf ?? ""),
      cargo: f.cargo != null ? cargoPorId.get(Number(f.cargo)) ?? null : null,
      empresa: empresaPorId.get(Number(f.empresa_id)) ?? null,
      ativo: Boolean(f.ativo),
    });
  };

  const originaisPorNsr = new Map<string, MarcacaoPonto>();
  const porFuncionario = new Map<number, MarcacaoPonto[]>();

  const pushMarcacao = (funcionarioId: number, m: MarcacaoPonto) => {
    const lista = porFuncionario.get(funcionarioId) ?? [];
    lista.push(m);
    porFuncionario.set(funcionarioId, lista);
  };

  for (const raw of rows) {
    const func = um(raw.funcionarios);
    if (!func) continue;
    garantirFunc(func);
    const m: MarcacaoPonto = {
      id: Number(raw.id),
      nsr: Number(raw.nsr),
      empregador_id: Number(raw.empregador_id),
      data_hora_fato: raw.data_hora_fato,
      data_hora_original: null,
      fuso_horario: raw.fuso_horario,
      tipo_batida: raw.tipo_batida,
      metodo_validacao: raw.metodo_validacao,
      dispositivo_id: raw.dispositivo_id,
      score_precisao: scoreNumero(raw.score_precisao),
      desconsiderada: false,
      origem: "ORIGINAL",
      tratamento: null,
    };
    originaisPorNsr.set(chaveNsr(m.empregador_id, m.nsr!), m);
    pushMarcacao(func.id, m);
  }

  const resumoTratamento = (t: TratamentoRow): TratamentoPontoResumo => ({
    id: Number(t.id),
    tipo_alteracao: t.tipo_alteracao as TipoTratamentoPonto,
    motivo: String(t.motivo ?? "").trim(),
    data_hora_processamento: t.data_hora_processamento,
    responsavel: nomeResponsavel.get(Number(t.usuario_responsavel_id)) ?? null,
  });

  for (const t of tratamentos) {
    const func = um(t.funcionarios);
    garantirFunc(func);
    const funcionarioId = Number(t.funcionario_id);
    const tratamento = resumoTratamento(t);

    if (t.tipo_alteracao === "INCLUSAO") {
      pushMarcacao(funcionarioId, {
        id: null,
        nsr: null,
        empregador_id: Number(t.empregador_id),
        data_hora_fato: t.data_hora_nova,
        data_hora_original: null,
        fuso_horario: "-03:00",
        tipo_batida: "INCLUIDO_MANUAL",
        metodo_validacao: null,
        dispositivo_id: null,
        score_precisao: null,
        desconsiderada: false,
        origem: "INCLUSAO",
        tratamento,
      });
      continue;
    }

    const nsr = t.nsr_referencia == null ? null : Number(t.nsr_referencia);
    if (!nsr) continue;
    const original = originaisPorNsr.get(chaveNsr(Number(t.empregador_id), nsr));
    if (!original) {
      if (t.tipo_alteracao === "CORRECAO_HORARIO") {
        pushMarcacao(funcionarioId, {
          id: null,
          nsr,
          empregador_id: Number(t.empregador_id),
          data_hora_fato: t.data_hora_nova,
          data_hora_original: null,
          fuso_horario: "-03:00",
          tipo_batida: "ORIGINAL",
          metodo_validacao: null,
          dispositivo_id: null,
          score_precisao: null,
          desconsiderada: false,
          origem: "CORRECAO_HORARIO",
          tratamento,
        });
      }
      continue;
    }

    if (t.tipo_alteracao === "DESCONSIDERACAO") {
      original.desconsiderada = true;
      original.tratamento = tratamento;
      continue;
    }

    const ymdOrig = ymdEmSaoPaulo(original.data_hora_original ?? original.data_hora_fato);
    const ymdNovo = ymdEmSaoPaulo(t.data_hora_nova);
    original.tratamento = tratamento;
    original.origem = "CORRECAO_HORARIO";
    original.data_hora_original = original.data_hora_original ?? original.data_hora_fato;

    if (ymdOrig === ymdNovo) {
      original.data_hora_fato = t.data_hora_nova;
      original.desconsiderada = false;
    } else {
      original.desconsiderada = true;
      pushMarcacao(funcionarioId, {
        id: original.id,
        nsr: original.nsr,
        empregador_id: original.empregador_id,
        data_hora_fato: t.data_hora_nova,
        data_hora_original: original.data_hora_original,
        fuso_horario: original.fuso_horario,
        tipo_batida: original.tipo_batida,
        metodo_validacao: original.metodo_validacao,
        dispositivo_id: original.dispositivo_id,
        score_precisao: original.score_precisao,
        desconsiderada: false,
        origem: "CORRECAO_HORARIO",
        tratamento,
      });
    }
  }

  const inicioYmd = dataInicio;
  const fimYmd = dataFim;
  const noPeriodo = (ymd: string) => ymd >= inicioYmd && ymd <= fimYmd;

  const funcionarios: FuncionarioPontoConsulta[] = [];
  const diasUnicos = new Set<string>();
  let totalEfetivas = 0;
  let totalMinutos = 0;

  for (const [funcionarioId, marcacoes] of porFuncionario) {
    const info = funcInfo.get(funcionarioId);
    if (!info) continue;

    const porDia = new Map<string, MarcacaoPonto[]>();
    for (const m of marcacoes) {
      const ymd = ymdEmSaoPaulo(m.data_hora_fato);
      if (!noPeriodo(ymd)) continue;
      const lista = porDia.get(ymd) ?? [];
      lista.push(m);
      porDia.set(ymd, lista);
    }
    if (porDia.size === 0) continue;

    const dias: DiaPontoFuncionario[] = [...porDia.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
      .map(([data, lista]) => {
        lista.sort((a, b) => a.data_hora_fato.localeCompare(b.data_hora_fato));
        diasUnicos.add(data);
        const efetivas = lista.filter((m) => !m.desconsiderada);
        totalEfetivas += efetivas.length;
        const horas = calcularHorasTrabalhadasDia(
          efetivas.map((m) => m.data_hora_fato),
          data,
        );
        totalMinutos += horas.minutos;
        return {
          data,
          marcacoes: lista,
          horas_trabalhadas_minutos: horas.minutos,
          em_aberto: horas.emAberto,
        };
      });

    funcionarios.push({ ...info, dias });
  }

  funcionarios.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    periodo: { data_inicio: dataInicio, data_fim: dataFim },
    resumo: {
      funcionarios: funcionarios.length,
      marcacoes: totalEfetivas,
      dias_com_ponto: diasUnicos.size,
      horas_trabalhadas_minutos: totalMinutos,
    },
    funcionarios,
    funcionarios_opcoes: funcionariosOpcoes,
  };
}
