"use client";

import type {
  GranularidadeComparativo,
  RelatorioComparativoData,
} from "@/lib/relatorios/comparativo";
import { useCallback, useId, useState } from "react";
import {
  GraficoComparativoProcedimentos,
  GraficoComparativoProcedimentosValor,
  GraficoComparativoProdutos,
  GraficoComparativoProdutosValor,
  GraficoComparativoResumo,
  GraficoComparativoTicketMedio,
  GraficoComparativoValorTotal,
} from "./comparativo-charts";
import "../atendimentos/relatorio-atendimentos.css";

function dataLocalYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mesLocalYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mesAnteriorYm(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ymdMenosDias(ymd: string, dias: number): string {
  const [y, mo, da] = ymd.split("-").map(Number);
  const d = new Date(y, mo - 1, da);
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  const s = v > 0 ? "+" : "";
  return `${s}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function classeVariacao(v: number | null): string {
  if (v == null || v === 0) return "text-muted";
  return v > 0 ? "text-success" : "text-danger";
}

function fmtDiff(n: number, moeda = false): string {
  const s = n > 0 ? "+" : "";
  if (moeda) return `${s}${fmtBrl(n)}`;
  return `${s}${n.toLocaleString("pt-BR")}`;
}

type KpiProps = {
  rotulo: string;
  valorA: number;
  valorB: number;
  variacaoPct: number | null;
  moeda?: boolean;
};

function KpiComparativo({ rotulo, valorA, valorB, variacaoPct, moeda }: KpiProps) {
  const fmt = moeda ? fmtBrl : (n: number) => n.toLocaleString("pt-BR");
  return (
    <div className="col-md-4 col-lg-2 mb-3">
      <div className="border rounded p-3 h-100 bg-white">
        <div className="text-muted small mb-2">{rotulo}</div>
        <div className="small">
          <span className="text-muted">A:</span> {fmt(valorA)}
        </div>
        <div className="small mb-1">
          <span className="text-muted">B:</span> <strong>{fmt(valorB)}</strong>
        </div>
        <div className={`small font-weight-bold ${classeVariacao(variacaoPct)}`}>
          {fmtPct(variacaoPct)}
        </div>
      </div>
    </div>
  );
}

export function ComparativoClient() {
  const hoje = dataLocalYmd();
  const filtrosId = useId();

  const [granularidade, setGranularidade] = useState<GranularidadeComparativo>("mes");
  const [periodoA, setPeriodoA] = useState(() => mesAnteriorYm());
  const [periodoB, setPeriodoB] = useState(() => mesLocalYm());
  const [diaA, setDiaA] = useState(() => ymdMenosDias(hoje, 1));
  const [diaB, setDiaB] = useState(hoje);
  const [anoA, setAnoA] = useState(() => String(new Date().getFullYear() - 1));
  const [anoB, setAnoB] = useState(() => String(new Date().getFullYear()));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RelatorioComparativoData | null>(null);

  const valorPeriodoA =
    granularidade === "dia" ? diaA : granularidade === "mes" ? periodoA : anoA;
  const valorPeriodoB =
    granularidade === "dia" ? diaB : granularidade === "mes" ? periodoB : anoB;

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        granularidade,
        periodo_a: valorPeriodoA,
        periodo_b: valorPeriodoB,
      });
      const res = await fetch(`/api/relatorios/comparativo?${params.toString()}`, {
        credentials: "include",
      });
      const j = (await res.json()) as { data?: RelatorioComparativoData; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar comparativo.");
      setData(j.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [granularidade, valorPeriodoA, valorPeriodoB]);

  return (
    <>
      <div className="card card-outline card-primary mb-3">
        <div className="card-header">
          <h3 className="card-title mb-0" id={filtrosId}>
            Comparar períodos
          </h3>
        </div>
        <div className="card-body">
          <p className="text-muted small">
            Compare atendimentos realizados, procedimentos e produtos entre dois períodos.
            Período A é a referência; Período B é comparado com A.
          </p>
          <div className="form-row align-items-end">
            <div className="form-group col-md-3">
              <label htmlFor="cmp-gran">Comparar por</label>
              <select
                id="cmp-gran"
                className="form-control"
                value={granularidade}
                onChange={(e) =>
                  setGranularidade(e.target.value as GranularidadeComparativo)
                }
              >
                <option value="dia">Dia</option>
                <option value="mes">Mês</option>
                <option value="ano">Ano</option>
              </select>
            </div>

            {granularidade === "dia" ? (
              <>
                <div className="form-group col-md-3">
                  <label htmlFor="cmp-dia-a">Período A (dia)</label>
                  <input
                    id="cmp-dia-a"
                    type="date"
                    className="form-control"
                    value={diaA}
                    onChange={(e) => setDiaA(e.target.value)}
                  />
                </div>
                <div className="form-group col-md-3">
                  <label htmlFor="cmp-dia-b">Período B (dia)</label>
                  <input
                    id="cmp-dia-b"
                    type="date"
                    className="form-control"
                    value={diaB}
                    onChange={(e) => setDiaB(e.target.value)}
                  />
                </div>
              </>
            ) : null}

            {granularidade === "mes" ? (
              <>
                <div className="form-group col-md-3">
                  <label htmlFor="cmp-mes-a">Período A (mês)</label>
                  <input
                    id="cmp-mes-a"
                    type="month"
                    className="form-control"
                    value={periodoA}
                    onChange={(e) => setPeriodoA(e.target.value)}
                  />
                </div>
                <div className="form-group col-md-3">
                  <label htmlFor="cmp-mes-b">Período B (mês)</label>
                  <input
                    id="cmp-mes-b"
                    type="month"
                    className="form-control"
                    value={periodoB}
                    onChange={(e) => setPeriodoB(e.target.value)}
                  />
                </div>
              </>
            ) : null}

            {granularidade === "ano" ? (
              <>
                <div className="form-group col-md-3">
                  <label htmlFor="cmp-ano-a">Período A (ano)</label>
                  <input
                    id="cmp-ano-a"
                    type="number"
                    min={2000}
                    max={2100}
                    className="form-control"
                    value={anoA}
                    onChange={(e) => setAnoA(e.target.value)}
                  />
                </div>
                <div className="form-group col-md-3">
                  <label htmlFor="cmp-ano-b">Período B (ano)</label>
                  <input
                    id="cmp-ano-b"
                    type="number"
                    min={2000}
                    max={2100}
                    className="form-control"
                    value={anoB}
                    onChange={(e) => setAnoB(e.target.value)}
                  />
                </div>
              </>
            ) : null}

            <div className="form-group col-md-3">
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={loading}
                onClick={() => void carregar()}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-1" aria-hidden />
                    Comparando…
                  </>
                ) : (
                  <>
                    <i className="fas fa-chart-line mr-1" aria-hidden />
                    Comparar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="card mb-3">
            <div className="card-header">
              <h3 className="card-title mb-0">Atendimentos</h3>
            </div>
            <div className="card-body">
              <div className="row mb-2">
                <div className="col-md-6">
                  <span className="badge badge-secondary mr-2">A</span>
                  {data.periodo_a.periodo.rotulo}
                </div>
                <div className="col-md-6">
                  <span className="badge badge-primary mr-2">B</span>
                  {data.periodo_b.periodo.rotulo}
                </div>
              </div>
              <div className="row">
                <KpiComparativo
                  rotulo="Atendimentos"
                  valorA={data.periodo_a.atendimentos}
                  valorB={data.periodo_b.atendimentos}
                  variacaoPct={data.variacao.atendimentos_pct}
                />
                <KpiComparativo
                  rotulo="Valor total"
                  valorA={data.periodo_a.valor_total}
                  valorB={data.periodo_b.valor_total}
                  variacaoPct={data.variacao.valor_total_pct}
                  moeda
                />
                <KpiComparativo
                  rotulo="Ticket médio"
                  valorA={data.periodo_a.ticket_medio}
                  valorB={data.periodo_b.ticket_medio}
                  variacaoPct={data.variacao.ticket_medio_pct}
                  moeda
                />
                <KpiComparativo
                  rotulo="Procedimentos (qtd)"
                  valorA={data.periodo_a.procedimentos_qtd}
                  valorB={data.periodo_b.procedimentos_qtd}
                  variacaoPct={data.variacao.procedimentos_qtd_pct}
                />
                <KpiComparativo
                  rotulo="Produtos (qtd)"
                  valorA={data.periodo_a.produtos_qtd}
                  valorB={data.periodo_b.produtos_qtd}
                  variacaoPct={data.variacao.produtos_qtd_pct}
                />
              </div>
            </div>
          </div>

          <div className="row relatorio-atendimentos mb-3">
            <div className="col-lg-6 mb-3">
              <div className="card relatorio-atendimentos-chart-card h-100">
                <div className="card-header">
                  <h3 className="card-title mb-0">Quantidades</h3>
                </div>
                <div className="card-body">
                  <GraficoComparativoResumo data={data} />
                </div>
              </div>
            </div>
            <div className="col-lg-3 mb-3">
              <div className="card relatorio-atendimentos-chart-card h-100">
                <div className="card-header">
                  <h3 className="card-title mb-0">Valor total</h3>
                </div>
                <div className="card-body">
                  <GraficoComparativoValorTotal data={data} />
                </div>
              </div>
            </div>
            <div className="col-lg-3 mb-3">
              <div className="card relatorio-atendimentos-chart-card h-100">
                <div className="card-header">
                  <h3 className="card-title mb-0">Ticket médio</h3>
                </div>
                <div className="card-body">
                  <GraficoComparativoTicketMedio data={data} />
                </div>
              </div>
            </div>
          </div>

          <div className="row relatorio-atendimentos mb-3">
            <div className="col-lg-6 mb-3">
              <div className="card relatorio-atendimentos-chart-card h-100">
                <div className="card-header">
                  <h3 className="card-title mb-0">Procedimentos — quantidade</h3>
                </div>
                <div className="card-body">
                  <GraficoComparativoProcedimentos data={data} />
                </div>
              </div>
            </div>
            <div className="col-lg-6 mb-3">
              <div className="card relatorio-atendimentos-chart-card h-100">
                <div className="card-header">
                  <h3 className="card-title mb-0">Produtos — quantidade</h3>
                </div>
                <div className="card-body">
                  <GraficoComparativoProdutos data={data} />
                </div>
              </div>
            </div>
          </div>

          <div className="row relatorio-atendimentos mb-3">
            <div className="col-lg-6 mb-3">
              <div className="card relatorio-atendimentos-chart-card h-100">
                <div className="card-header">
                  <h3 className="card-title mb-0">Procedimentos — valor</h3>
                </div>
                <div className="card-body">
                  <GraficoComparativoProcedimentosValor data={data} />
                </div>
              </div>
            </div>
            <div className="col-lg-6 mb-3">
              <div className="card relatorio-atendimentos-chart-card h-100">
                <div className="card-header">
                  <h3 className="card-title mb-0">Produtos — valor</h3>
                </div>
                <div className="card-body">
                  <GraficoComparativoProdutosValor data={data} />
                </div>
              </div>
            </div>
          </div>

          <div className="row">
            <div className="col-lg-6 mb-3">
              <div className="card h-100">
                <div className="card-header">
                  <h3 className="card-title mb-0">Procedimentos</h3>
                </div>
                <div className="card-body p-0 table-responsive">
                  <table className="table table-sm table-striped mb-0">
                    <thead>
                      <tr>
                        <th>Procedimento</th>
                        <th className="text-right">Qtd A</th>
                        <th className="text-right">Qtd B</th>
                        <th className="text-right">Δ Qtd</th>
                        <th className="text-right">Valor A</th>
                        <th className="text-right">Valor B</th>
                        <th className="text-right">Δ Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.comparativo_procedimentos.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center text-muted py-3">
                            Nenhum procedimento nos períodos.
                          </td>
                        </tr>
                      ) : (
                        data.comparativo_procedimentos.map((r) => (
                          <tr key={r.chave}>
                            <td>{r.nome}</td>
                            <td className="text-right">{r.quantidade_a}</td>
                            <td className="text-right">{r.quantidade_b}</td>
                            <td
                              className={`text-right font-weight-bold ${r.diff_quantidade > 0 ? "text-success" : r.diff_quantidade < 0 ? "text-danger" : "text-muted"}`}
                            >
                              {fmtDiff(r.diff_quantidade)}
                            </td>
                            <td className="text-right">{fmtBrl(r.valor_a)}</td>
                            <td className="text-right">{fmtBrl(r.valor_b)}</td>
                            <td
                              className={`text-right font-weight-bold ${r.diff_valor > 0 ? "text-success" : r.diff_valor < 0 ? "text-danger" : "text-muted"}`}
                            >
                              {fmtDiff(r.diff_valor, true)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="col-lg-6 mb-3">
              <div className="card h-100">
                <div className="card-header">
                  <h3 className="card-title mb-0">Produtos</h3>
                </div>
                <div className="card-body p-0 table-responsive">
                  <table className="table table-sm table-striped mb-0">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th className="text-right">Qtd A</th>
                        <th className="text-right">Qtd B</th>
                        <th className="text-right">Δ Qtd</th>
                        <th className="text-right">Valor A</th>
                        <th className="text-right">Valor B</th>
                        <th className="text-right">Δ Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.comparativo_produtos.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center text-muted py-3">
                            Nenhum produto nos períodos.
                          </td>
                        </tr>
                      ) : (
                        data.comparativo_produtos.map((r) => (
                          <tr key={r.chave}>
                            <td>{r.nome}</td>
                            <td className="text-right">{r.quantidade_a}</td>
                            <td className="text-right">{r.quantidade_b}</td>
                            <td
                              className={`text-right font-weight-bold ${r.diff_quantidade > 0 ? "text-success" : r.diff_quantidade < 0 ? "text-danger" : "text-muted"}`}
                            >
                              {fmtDiff(r.diff_quantidade)}
                            </td>
                            <td className="text-right">{fmtBrl(r.valor_a)}</td>
                            <td className="text-right">{fmtBrl(r.valor_b)}</td>
                            <td
                              className={`text-right font-weight-bold ${r.diff_valor > 0 ? "text-success" : r.diff_valor < 0 ? "text-danger" : "text-muted"}`}
                            >
                              {fmtDiff(r.diff_valor, true)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : !loading && !error ? (
        <p className="text-muted">Selecione os períodos e clique em Comparar.</p>
      ) : null}
    </>
  );
}
