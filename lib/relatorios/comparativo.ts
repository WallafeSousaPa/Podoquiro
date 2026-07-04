import type { SupabaseClient } from "@supabase/supabase-js";
import {
  gerarRelatorioAtendimentos,
  type RelatorioAtendimentosPorProcedimento,
  type RelatorioAtendimentosPorProduto,
} from "@/lib/relatorios/atendimentos";
import { DATA_YMD_RE, validarPeriodoRelatorio } from "@/lib/relatorios/periodo";

export type GranularidadeComparativo = "dia" | "mes" | "ano";

const MES_YM_RE = /^\d{4}-\d{2}$/;
const ANO_RE = /^\d{4}$/;

export type PeriodoComparativoResolvido = {
  chave: string;
  rotulo: string;
  data_inicio: string;
  data_fim: string;
};

export type ResumoComparativoPeriodo = {
  periodo: PeriodoComparativoResolvido;
  atendimentos: number;
  valor_total: number;
  ticket_medio: number;
  procedimentos_qtd: number;
  procedimentos_valor: number;
  produtos_qtd: number;
  produtos_valor: number;
  por_procedimento: RelatorioAtendimentosPorProcedimento[];
  por_produto: RelatorioAtendimentosPorProduto[];
};

export type LinhaComparativa = {
  chave: string;
  nome: string;
  quantidade_a: number;
  quantidade_b: number;
  diff_quantidade: number;
  valor_a: number;
  valor_b: number;
  diff_valor: number;
};

export type RelatorioComparativoData = {
  granularidade: GranularidadeComparativo;
  periodo_a: ResumoComparativoPeriodo;
  periodo_b: ResumoComparativoPeriodo;
  variacao: {
    atendimentos_pct: number | null;
    valor_total_pct: number | null;
    ticket_medio_pct: number | null;
    procedimentos_qtd_pct: number | null;
    produtos_qtd_pct: number | null;
  };
  comparativo_procedimentos: LinhaComparativa[];
  comparativo_produtos: LinhaComparativa[];
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ultimoDiaMes(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function variacaoPct(anterior: number, atual: number): number | null {
  if (anterior === 0) {
    if (atual === 0) return 0;
    return null;
  }
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

export function resolverPeriodoComparativo(
  granularidade: GranularidadeComparativo,
  chave: string,
): PeriodoComparativoResolvido | string {
  const t = chave.trim();
  if (granularidade === "dia") {
    if (!DATA_YMD_RE.test(t)) return "Data inválida (YYYY-MM-DD).";
    const [y, m, d] = t.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (Number.isNaN(dt.getTime())) return "Data inválida.";
    const rotulo = dt.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    return { chave: t, rotulo, data_inicio: t, data_fim: t };
  }

  if (granularidade === "mes") {
    if (!MES_YM_RE.test(t)) return "Mês inválido (YYYY-MM).";
    const [y, mo] = t.split("-").map(Number);
    if (mo < 1 || mo > 12) return "Mês inválido.";
    const ult = ultimoDiaMes(y, mo);
    const data_inicio = `${y}-${pad2(mo)}-01`;
    const data_fim = `${y}-${pad2(mo)}-${pad2(ult)}`;
    const rotulo = new Date(y, mo - 1, 1).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
    return { chave: t, rotulo, data_inicio, data_fim };
  }

  if (!ANO_RE.test(t)) return "Ano inválido (YYYY).";
  const y = Number(t);
  if (y < 2000 || y > 2100) return "Ano fora do intervalo permitido.";
  return {
    chave: t,
    rotulo: String(y),
    data_inicio: `${y}-01-01`,
    data_fim: `${y}-12-31`,
  };
}

export function validarParametrosComparativo(args: {
  granularidade: string;
  periodo_a: string;
  periodo_b: string;
}): { ok: true; granularidade: GranularidadeComparativo; a: PeriodoComparativoResolvido; b: PeriodoComparativoResolvido } | { ok: false; error: string } {
  const g = args.granularidade.trim();
  if (g !== "dia" && g !== "mes" && g !== "ano") {
    return { ok: false, error: "granularidade deve ser dia, mes ou ano." };
  }
  const granularidade = g as GranularidadeComparativo;

  const rawA = args.periodo_a.trim();
  const rawB = args.periodo_b.trim();
  if (!rawA || !rawB) {
    return { ok: false, error: "Informe periodo_a e periodo_b." };
  }
  if (rawA === rawB) {
    return { ok: false, error: "Os dois períodos devem ser diferentes." };
  }

  const resA = resolverPeriodoComparativo(granularidade, rawA);
  if (typeof resA === "string") return { ok: false, error: `Período A: ${resA}` };
  const resB = resolverPeriodoComparativo(granularidade, rawB);
  if (typeof resB === "string") return { ok: false, error: `Período B: ${resB}` };

  const errA = validarPeriodoRelatorio(resA.data_inicio, resA.data_fim);
  if (errA) return { ok: false, error: `Período A: ${errA}` };
  const errB = validarPeriodoRelatorio(resB.data_inicio, resB.data_fim);
  if (errB) return { ok: false, error: `Período B: ${errB}` };

  return { ok: true, granularidade, a: resA, b: resB };
}

async function carregarResumoPeriodo(
  supabase: SupabaseClient,
  idEmpresa: number,
  periodo: PeriodoComparativoResolvido,
): Promise<ResumoComparativoPeriodo> {
  const rel = await gerarRelatorioAtendimentos(supabase, {
    idEmpresa,
    dataInicio: periodo.data_inicio,
    dataFim: periodo.data_fim,
    statusFiltro: ["realizado"],
  });

  const procedimentos_qtd = rel.resumo.total_procedimentos_lancados;
  const procedimentos_valor = rel.por_procedimento.reduce((s, p) => s + p.valor_total, 0);
  const produtos_qtd = rel.resumo.total_produtos_lancados;
  const produtos_valor = rel.resumo.valor_produtos;

  return {
    periodo,
    atendimentos: rel.resumo.total_atendimentos,
    valor_total: rel.resumo.valor_total,
    ticket_medio: rel.resumo.ticket_medio,
    procedimentos_qtd,
    procedimentos_valor: Math.round(procedimentos_valor * 100) / 100,
    produtos_qtd,
    produtos_valor: Math.round(produtos_valor * 100) / 100,
    por_procedimento: rel.por_procedimento,
    por_produto: rel.por_produto,
  };
}

function montarLinhasComparativas(
  listaA: { chave: string; nome: string; quantidade: number; valor_total: number }[],
  listaB: { chave: string; nome: string; quantidade: number; valor_total: number }[],
): LinhaComparativa[] {
  const mapA = new Map(listaA.map((x) => [x.chave, x]));
  const mapB = new Map(listaB.map((x) => [x.chave, x]));
  const chaves = new Set([...mapA.keys(), ...mapB.keys()]);

  const linhas: LinhaComparativa[] = [];
  for (const chave of chaves) {
    const a = mapA.get(chave);
    const b = mapB.get(chave);
    const qa = a?.quantidade ?? 0;
    const qb = b?.quantidade ?? 0;
    const va = a?.valor_total ?? 0;
    const vb = b?.valor_total ?? 0;
    linhas.push({
      chave,
      nome: b?.nome ?? a?.nome ?? chave,
      quantidade_a: qa,
      quantidade_b: qb,
      diff_quantidade: qb - qa,
      valor_a: va,
      valor_b: vb,
      diff_valor: Math.round((vb - va) * 100) / 100,
    });
  }

  return linhas.sort(
    (x, y) =>
      Math.max(y.quantidade_a + y.quantidade_b, y.valor_a + y.valor_b) -
      Math.max(x.quantidade_a + x.quantidade_b, x.valor_a + x.valor_b),
  );
}

export async function gerarRelatorioComparativo(
  supabase: SupabaseClient,
  args: {
    idEmpresa: number;
    granularidade: GranularidadeComparativo;
    periodoA: PeriodoComparativoResolvido;
    periodoB: PeriodoComparativoResolvido;
  },
): Promise<RelatorioComparativoData> {
  const [a, b] = await Promise.all([
    carregarResumoPeriodo(supabase, args.idEmpresa, args.periodoA),
    carregarResumoPeriodo(supabase, args.idEmpresa, args.periodoB),
  ]);

  const procA = a.por_procedimento.map((p) => ({
    chave: String(p.id_procedimento),
    nome: p.nome,
    quantidade: p.quantidade,
    valor_total: p.valor_total,
  }));
  const procB = b.por_procedimento.map((p) => ({
    chave: String(p.id_procedimento),
    nome: p.nome,
    quantidade: p.quantidade,
    valor_total: p.valor_total,
  }));

  const prodA = a.por_produto.map((p) => ({
    chave: p.id_produto,
    nome: p.nome,
    quantidade: p.quantidade,
    valor_total: p.valor_total,
  }));
  const prodB = b.por_produto.map((p) => ({
    chave: p.id_produto,
    nome: p.nome,
    quantidade: p.quantidade,
    valor_total: p.valor_total,
  }));

  return {
    granularidade: args.granularidade,
    periodo_a: a,
    periodo_b: b,
    variacao: {
      atendimentos_pct: variacaoPct(a.atendimentos, b.atendimentos),
      valor_total_pct: variacaoPct(a.valor_total, b.valor_total),
      ticket_medio_pct: variacaoPct(a.ticket_medio, b.ticket_medio),
      procedimentos_qtd_pct: variacaoPct(a.procedimentos_qtd, b.procedimentos_qtd),
      produtos_qtd_pct: variacaoPct(a.produtos_qtd, b.produtos_qtd),
    },
    comparativo_procedimentos: montarLinhasComparativas(procA, procB),
    comparativo_produtos: montarLinhasComparativas(prodA, prodB),
  };
}
