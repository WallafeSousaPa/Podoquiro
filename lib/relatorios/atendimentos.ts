import type { SupabaseClient } from "@supabase/supabase-js";
import { rotuloStatusAgendamentoHistorico } from "@/lib/prontuario/historico-atendimentos";
import { dayStartIsoBr, nextDayStartIsoBr } from "@/lib/relatorios/periodo";

export const STATUS_RELATORIO_ATENDIMENTOS_PADRAO = ["realizado"] as const;

export const STATUS_RELATORIO_ATENDIMENTOS_OPCOES = [
  "realizado",
  "em_andamento",
  "confirmado",
  "pendente",
  "curativo_agendado",
  "cancelado",
  "faltou",
  "adiado",
] as const;

export type RelatorioAtendimentosPorPodologo = {
  id_usuario: number;
  nome: string;
  quantidade: number;
  valor_total: number;
  percentual_quantidade: number;
  percentual_valor: number;
  rank_quantidade: number;
  rank_valor: number;
};

export type RelatorioAtendimentosPorProcedimento = {
  id_procedimento: number;
  nome: string;
  quantidade: number;
  valor_total: number;
  percentual: number;
  rank: number;
};

export type RelatorioAtendimentosPorProduto = {
  id_produto: string;
  nome: string;
  quantidade: number;
  valor_total: number;
  percentual: number;
  rank: number;
};

export type RelatorioAtendimentosPorStatus = {
  status: string;
  rotulo: string;
  quantidade: number;
  valor_total: number;
};

export type RelatorioAtendimentosPorDia = {
  data: string;
  quantidade: number;
  valor_total: number;
};

export type RelatorioAtendimentosRetornoPodologo = {
  id_usuario: number;
  nome: string;
  solicitados: number;
  agendados: number;
  pendentes: number;
};

export type RelatorioAtendimentosRetornos = {
  resumo: {
    solicitados: number;
    agendados: number;
    pendentes_agendamento: number;
    curativos_no_periodo: number;
  };
  por_podologo: RelatorioAtendimentosRetornoPodologo[];
};

export type RelatorioAtendimentosData = {
  periodo: { data_inicio: string; data_fim: string };
  status_filtro: string[];
  resumo: {
    total_atendimentos: number;
    valor_total: number;
    ticket_medio: number;
    podologos_ativos: number;
    procedimentos_distintos: number;
    total_procedimentos_lancados: number;
    produtos_distintos: number;
    total_produtos_lancados: number;
    valor_produtos: number;
  };
  por_podologo: RelatorioAtendimentosPorPodologo[];
  por_procedimento: RelatorioAtendimentosPorProcedimento[];
  por_produto: RelatorioAtendimentosPorProduto[];
  por_status: RelatorioAtendimentosPorStatus[];
  por_dia: RelatorioAtendimentosPorDia[];
  retornos: RelatorioAtendimentosRetornos;
};

type AgRow = {
  id: number;
  id_usuario: number;
  status: string;
  valor_total: number | string;
  data_hora_inicio: string;
  agendar_retorno?: boolean | null;
  id_retorno?: number | null;
};

type UsuarioEmbed = {
  nome_completo?: string | null;
  usuario?: string | null;
};

function nomeProfissional(u: UsuarioEmbed | null): string {
  if (!u) return "Profissional não informado";
  const nc = u.nome_completo?.trim();
  if (nc) return nc;
  return u.usuario?.trim() || "Profissional não informado";
}

function extrairUsuario(raw: UsuarioEmbed | UsuarioEmbed[] | null): UsuarioEmbed | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function atribuirRanks<T extends { quantidade: number; valor_total: number }>(
  items: T[],
  getQty: (x: T) => number = (x) => x.quantidade,
  getVal: (x: T) => number = (x) => x.valor_total,
): (T & { rank_quantidade: number; rank_valor: number })[] {
  const porQtd = [...items].sort((a, b) => getQty(b) - getQty(a) || getVal(b) - getVal(a));
  const porVal = [...items].sort((a, b) => getVal(b) - getVal(a) || getQty(b) - getQty(a));
  const rankQ = new Map<T, number>();
  const rankV = new Map<T, number>();
  porQtd.forEach((item, i) => rankQ.set(item, i + 1));
  porVal.forEach((item, i) => rankV.set(item, i + 1));
  return items.map((item) => ({
    ...item,
    rank_quantidade: rankQ.get(item) ?? items.length,
    rank_valor: rankV.get(item) ?? items.length,
  }));
}

function atribuirRankSimples<T extends { quantidade: number }>(
  items: T[],
): (T & { rank: number })[] {
  const sorted = [...items].sort((a, b) => b.quantidade - a.quantidade);
  const rank = new Map<T, number>();
  sorted.forEach((item, i) => rank.set(item, i + 1));
  return items.map((item) => ({ ...item, rank: rank.get(item) ?? items.length }));
}

export function parseStatusFiltroRelatorioAtendimentos(raw: string | null): string[] {
  if (raw == null || raw.trim() === "" || raw.trim() === "todos") {
    return [...STATUS_RELATORIO_ATENDIMENTOS_PADRAO];
  }
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = new Set<string>(STATUS_RELATORIO_ATENDIMENTOS_OPCOES);
  const filtered = parts.filter((s) => valid.has(s));
  return filtered.length > 0 ? filtered : [...STATUS_RELATORIO_ATENDIMENTOS_PADRAO];
}

export async function gerarRelatorioAtendimentos(
  supabase: SupabaseClient,
  args: {
    idEmpresa: number;
    dataInicio: string;
    dataFim: string;
    statusFiltro: string[];
  },
): Promise<RelatorioAtendimentosData> {
  const inicioIso = dayStartIsoBr(args.dataInicio);
  const fimExclusivo = nextDayStartIsoBr(args.dataFim);

  let q = supabase
    .from("agendamentos")
    .select(
      `
      id,
      id_usuario,
      status,
      valor_total,
      data_hora_inicio,
      agendar_retorno,
      id_retorno,
      usuarios ( nome_completo, usuario )
    `,
    )
    .eq("id_empresa", args.idEmpresa)
    .gte("data_hora_inicio", inicioIso)
    .lt("data_hora_inicio", fimExclusivo)
    .in("status", args.statusFiltro)
    .order("data_hora_inicio", { ascending: true });

  const { data: agRows, error: agErr } = await q;
  if (agErr) throw new Error(agErr.message);

  const rows = (agRows ?? []) as (AgRow & { usuarios: UsuarioEmbed | UsuarioEmbed[] | null })[];
  const idsAg = rows.map((r) => r.id);

  type ProcLinha = { id_procedimento: number; nome: string; valor: number };
  const procsPorAg = new Map<number, ProcLinha[]>();
  if (idsAg.length > 0) {
    const { data: procRows, error: pErr } = await supabase
      .from("agendamento_procedimentos")
      .select("id_agendamento, id_procedimento, valor_aplicado, procedimentos ( procedimento )")
      .in("id_agendamento", idsAg);
    if (pErr) throw new Error(pErr.message);

    for (const row of procRows ?? []) {
      const idAg = row.id_agendamento as number;
      const idProc = row.id_procedimento as number;
      const valor = Number(row.valor_aplicado) || 0;
      const pr = row.procedimentos as
        | { procedimento: string }
        | { procedimento: string }[]
        | null;
      const p0 = Array.isArray(pr) ? pr[0] : pr;
      const lista = procsPorAg.get(idAg) ?? [];
      lista.push({
        id_procedimento: idProc,
        valor,
        nome: String(p0?.procedimento ?? "—"),
      });
      procsPorAg.set(idAg, lista);
    }
  }

  type ProdLinha = { id_produto: string; nome: string; qtd: number; valor: number };
  const prodsPorAg = new Map<number, ProdLinha[]>();
  if (idsAg.length > 0) {
    const { data: prodRows, error: prodErr } = await supabase
      .from("agendamento_produtos")
      .select("id_agendamento, id_produto, qtd, valor_final, produtos ( produto )")
      .in("id_agendamento", idsAg);
    if (prodErr) throw new Error(prodErr.message);

    for (const row of prodRows ?? []) {
      const idAg = row.id_agendamento as number;
      const idProd = String(row.id_produto);
      const qtd = Number(row.qtd) || 0;
      const valor = Number(row.valor_final) || 0;
      const pr = row.produtos as
        | { produto: string }
        | { produto: string }[]
        | null;
      const p0 = Array.isArray(pr) ? pr[0] : pr;
      const lista = prodsPorAg.get(idAg) ?? [];
      lista.push({
        id_produto: idProd,
        qtd,
        valor,
        nome: String(p0?.produto ?? "—"),
      });
      prodsPorAg.set(idAg, lista);
    }
  }

  type ProcAcc = { id_procedimento: number; nome: string; quantidade: number; valor_total: number };
  const procAcc = new Map<number, ProcAcc>();
  type ProdAcc = { id_produto: string; nome: string; quantidade: number; valor_total: number };
  const prodAcc = new Map<string, ProdAcc>();

  for (const row of rows) {
    const procs = procsPorAg.get(row.id) ?? [];
    for (const p of procs) {
      const cur = procAcc.get(p.id_procedimento) ?? {
        id_procedimento: p.id_procedimento,
        nome: p.nome,
        quantidade: 0,
        valor_total: 0,
      };
      cur.quantidade += 1;
      cur.valor_total += p.valor;
      procAcc.set(p.id_procedimento, cur);
    }
  }

  for (const row of rows) {
    const prods = prodsPorAg.get(row.id) ?? [];
    for (const p of prods) {
      const cur = prodAcc.get(p.id_produto) ?? {
        id_produto: p.id_produto,
        nome: p.nome,
        quantidade: 0,
        valor_total: 0,
      };
      cur.quantidade += p.qtd;
      cur.valor_total += p.valor;
      prodAcc.set(p.id_produto, cur);
    }
  }

  const podologoAcc = new Map<
    number,
    { id_usuario: number; nome: string; quantidade: number; valor_total: number }
  >();
  const retornoPodAcc = new Map<
    number,
    RelatorioAtendimentosRetornoPodologo
  >();
  const statusAcc = new Map<string, { quantidade: number; valor_total: number }>();
  const diaAcc = new Map<string, { quantidade: number; valor_total: number }>();

  let valorTotalGeral = 0;
  let totalProcedimentosLancados = 0;
  let totalProdutosLancados = 0;
  let valorProdutosGeral = 0;
  let retornosSolicitados = 0;
  let retornosAgendados = 0;
  let retornosPendentes = 0;

  for (const row of rows) {
    const idUser = row.id_usuario as number;
    const valor = Number(row.valor_total) || 0;
    const status = String(row.status ?? "");
    valorTotalGeral += valor;

    const usuario = extrairUsuario(row.usuarios);
    const nome = nomeProfissional(usuario);
    const pod = podologoAcc.get(idUser) ?? {
      id_usuario: idUser,
      nome,
      quantidade: 0,
      valor_total: 0,
    };
    pod.quantidade += 1;
    pod.valor_total += valor;
    podologoAcc.set(idUser, pod);

    const st = statusAcc.get(status) ?? { quantidade: 0, valor_total: 0 };
    st.quantidade += 1;
    st.valor_total += valor;
    statusAcc.set(status, st);

    const dia = String(row.data_hora_inicio).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
      const d = diaAcc.get(dia) ?? { quantidade: 0, valor_total: 0 };
      d.quantidade += 1;
      d.valor_total += valor;
      diaAcc.set(dia, d);
    }

    totalProcedimentosLancados += (procsPorAg.get(row.id) ?? []).length;

    const prodsAg = prodsPorAg.get(row.id) ?? [];
    for (const pr of prodsAg) {
      totalProdutosLancados += pr.qtd;
      valorProdutosGeral += pr.valor;
    }

    if (row.agendar_retorno === true) {
      retornosSolicitados += 1;
      const temRetornoAgendado = row.id_retorno != null && Number(row.id_retorno) > 0;
      if (temRetornoAgendado) {
        retornosAgendados += 1;
      } else {
        retornosPendentes += 1;
      }
      const rp = retornoPodAcc.get(idUser) ?? {
        id_usuario: idUser,
        nome,
        solicitados: 0,
        agendados: 0,
        pendentes: 0,
      };
      rp.solicitados += 1;
      if (temRetornoAgendado) rp.agendados += 1;
      else rp.pendentes += 1;
      retornoPodAcc.set(idUser, rp);
    }
  }

  const { count: curativosNoPeriodo, error: curErr } = await supabase
    .from("agendamentos")
    .select("id", { count: "exact", head: true })
    .eq("id_empresa", args.idEmpresa)
    .eq("status", "curativo_agendado")
    .gte("data_hora_inicio", inicioIso)
    .lt("data_hora_inicio", fimExclusivo);

  if (curErr) throw new Error(curErr.message);

  const totalAtendimentos = rows.length;
  const pct = (parte: number, total: number) =>
    total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;

  const podologosBase = [...podologoAcc.values()];
  const podologosComPct = podologosBase.map((p) => ({
    ...p,
    percentual_quantidade: pct(p.quantidade, totalAtendimentos),
    percentual_valor: pct(p.valor_total, valorTotalGeral),
  }));
  const podologosRanked = atribuirRanks(podologosComPct).sort(
    (a, b) => a.rank_quantidade - b.rank_quantidade,
  );

  const procBase = [...procAcc.values()];
  const totalProcQtd = procBase.reduce((s, p) => s + p.quantidade, 0);
  const procComPct = procBase.map((p) => ({
    ...p,
    percentual: pct(p.quantidade, totalProcQtd),
  }));
  const procRanked = atribuirRankSimples(procComPct).sort((a, b) => a.rank - b.rank);

  const prodBase = [...prodAcc.values()];
  const totalProdQtd = prodBase.reduce((s, p) => s + p.quantidade, 0);
  const prodComPct = prodBase.map((p) => ({
    ...p,
    percentual: pct(p.quantidade, totalProdQtd),
  }));
  const prodRanked = atribuirRankSimples(prodComPct).sort((a, b) => a.rank - b.rank);

  const porStatus: RelatorioAtendimentosPorStatus[] = [...statusAcc.entries()]
    .map(([status, v]) => ({
      status,
      rotulo: rotuloStatusAgendamentoHistorico(status),
      quantidade: v.quantidade,
      valor_total: v.valor_total,
    }))
    .sort((a, b) => b.quantidade - a.quantidade);

  const porDia: RelatorioAtendimentosPorDia[] = [...diaAcc.entries()]
    .map(([data, v]) => ({ data, ...v }))
    .sort((a, b) => a.data.localeCompare(b.data));

  return {
    periodo: { data_inicio: args.dataInicio, data_fim: args.dataFim },
    status_filtro: args.statusFiltro,
    resumo: {
      total_atendimentos: totalAtendimentos,
      valor_total: valorTotalGeral,
      ticket_medio:
        totalAtendimentos > 0
          ? Math.round((valorTotalGeral / totalAtendimentos) * 100) / 100
          : 0,
      podologos_ativos: podologoAcc.size,
      procedimentos_distintos: procAcc.size,
      total_procedimentos_lancados: totalProcedimentosLancados,
      produtos_distintos: prodAcc.size,
      total_produtos_lancados: Math.round(totalProdutosLancados * 10000) / 10000,
      valor_produtos: Math.round(valorProdutosGeral * 100) / 100,
    },
    por_podologo: podologosRanked,
    por_procedimento: procRanked,
    por_produto: prodRanked,
    por_status: porStatus,
    por_dia: porDia,
    retornos: {
      resumo: {
        solicitados: retornosSolicitados,
        agendados: retornosAgendados,
        pendentes_agendamento: retornosPendentes,
        curativos_no_periodo: curativosNoPeriodo ?? 0,
      },
      por_podologo: [...retornoPodAcc.values()].sort(
        (a, b) => b.solicitados - a.solicitados,
      ),
    },
  };
}
