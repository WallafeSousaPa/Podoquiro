"use client";

import type { RelatorioAtendimentosData } from "@/lib/relatorios/atendimentos";
import { STATUS_RELATORIO_ATENDIMENTOS_OPCOES } from "@/lib/relatorios/atendimentos";
import { rotuloStatusAgendamentoHistorico } from "@/lib/prontuario/historico-atendimentos";
import { useCallback, useEffect, useId, useState } from "react";
import {
  GraficoAtendimentosPorDia,
  GraficoAtendimentosPorPodologo,
  GraficoProcedimentosPizza,
  GraficoProdutosPizza,
  GraficoStatusPizza,
  GraficoRetornos,
} from "./relatorio-atendimentos-charts";
import "./relatorio-atendimentos.css";

function dataLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdMenosDias(ymd: string, dias: number): string {
  const [y, mo, da] = ymd.split("-").map((x) => Number(x));
  const d = new Date(y, mo - 1, da);
  d.setDate(d.getDate() - dias);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDataRef(ymd: string) {
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
  } catch {
    return ymd;
  }
}

const STATUS_PADRAO = new Set(["realizado"]);

export function RelatorioAtendimentosClient() {
  const hoje = dataLocalYmd();
  const filtrosId = useId();
  const resumoLiveId = useId();

  const [dataInicio, setDataInicio] = useState(() => ymdMenosDias(hoje, 30));
  const [dataFim, setDataFim] = useState(hoje);
  const [statusSel, setStatusSel] = useState<Set<string>>(() => new Set(STATUS_PADRAO));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RelatorioAtendimentosData | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = [...statusSel].join(",");
      const url = `/api/relatorios/atendimentos?data_inicio=${encodeURIComponent(dataInicio)}&data_fim=${encodeURIComponent(dataFim)}&status=${encodeURIComponent(status)}`;
      const res = await fetch(url, { credentials: "include" });
      const j = (await res.json()) as { data?: RelatorioAtendimentosData; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar relatório.");
      setData(j.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, statusSel]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const toggleStatus = (status: string) => {
    setStatusSel((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        if (next.size <= 1) return prev;
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const aplicarPreset = (dias: number) => {
    setDataInicio(ymdMenosDias(hoje, dias));
    setDataFim(hoje);
  };

  const exportarCsv = () => {
    if (!data) return;
    const linhas: string[] = [
      "Relatório de atendimentos",
      `Período;${fmtDataRef(data.periodo.data_inicio)};${fmtDataRef(data.periodo.data_fim)}`,
      "",
      "Ranking podólogos",
      "Posição;Nome;Atendimentos;Valor total;% qtd;% valor",
    ];
    for (const p of data.por_podologo) {
      linhas.push(
        `${p.rank_quantidade};${p.nome};${p.quantidade};${p.valor_total.toFixed(2)};${p.percentual_quantidade};${p.percentual_valor}`,
      );
    }
    linhas.push("", "Ranking procedimentos", "Posição;Procedimento;Quantidade;Valor;%");
    for (const p of data.por_procedimento) {
      linhas.push(
        `${p.rank};${p.nome};${p.quantidade};${p.valor_total.toFixed(2)};${p.percentual}`,
      );
    }
    linhas.push("", "Ranking produtos", "Posição;Produto;Unidades;Valor;%");
    for (const p of data.por_produto) {
      linhas.push(
        `${p.rank};${p.nome};${p.quantidade};${p.valor_total.toFixed(2)};${p.percentual}`,
      );
    }
    const blob = new Blob(["\uFEFF" + linhas.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-atendimentos-${data.periodo.data_inicio}-${data.periodo.data_fim}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const resumoTexto = data
    ? `${data.resumo.total_atendimentos} atendimentos, valor total ${fmtBrl(data.resumo.valor_total)}, ${data.resumo.total_procedimentos_lancados} procedimentos, ${data.resumo.total_produtos_lancados} unidades de produtos (${fmtBrl(data.resumo.valor_produtos)}), ${data.retornos.resumo.solicitados} retornos solicitados no período.`
    : "";

  return (
    <div className="relatorio-atendimentos">
      <div className="card card-outline card-primary mb-3">
        <div className="card-header">
          <h2 className="card-title h5 mb-0" id={filtrosId}>
            Filtros
          </h2>
        </div>
        <div className="card-body relatorio-atendimentos-filtros">
          <div className="row">
            <div className="col-12 col-md-4 col-lg-3">
              <div className="form-group">
                <label htmlFor="rel-atend-inicio">Data início</label>
                <input
                  id="rel-atend-inicio"
                  type="date"
                  className="form-control"
                  value={dataInicio}
                  max={dataFim}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
            </div>
            <div className="col-12 col-md-4 col-lg-3">
              <div className="form-group">
                <label htmlFor="rel-atend-fim">Data fim</label>
                <input
                  id="rel-atend-fim"
                  type="date"
                  className="form-control"
                  value={dataFim}
                  min={dataInicio}
                  max={hoje}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
            </div>
            <div className="col-12 col-lg-6">
              <fieldset>
                <legend className="small font-weight-bold mb-2">Status do agendamento</legend>
                <div
                  className="relatorio-atendimentos-status-grid"
                  role="group"
                  aria-label="Filtrar por status"
                >
                  {STATUS_RELATORIO_ATENDIMENTOS_OPCOES.map((st) => (
                    <div key={st} className="custom-control custom-checkbox">
                      <input
                        type="checkbox"
                        className="custom-control-input"
                        id={`rel-st-${st}`}
                        checked={statusSel.has(st)}
                        onChange={() => toggleStatus(st)}
                      />
                      <label className="custom-control-label" htmlFor={`rel-st-${st}`}>
                        {rotuloStatusAgendamentoHistorico(st)}
                      </label>
                    </div>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>
          <div className="d-flex flex-wrap align-items-center relatorio-atendimentos-presets mt-2">
            <span className="small text-muted mr-2 mb-1">Atalhos:</span>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary mr-1 mb-1"
              onClick={() => aplicarPreset(7)}
            >
              7 dias
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary mr-1 mb-1"
              onClick={() => aplicarPreset(30)}
            >
              30 dias
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary mr-2 mb-1"
              onClick={() => {
                const d = new Date();
                setDataInicio(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
                setDataFim(hoje);
              }}
            >
              Mês atual
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary mb-1"
              onClick={() => void carregar()}
              disabled={loading}
            >
              {loading ? "Atualizando…" : "Atualizar relatório"}
            </button>
          </div>
        </div>
      </div>

      <p id={resumoLiveId} className="relatorio-atendimentos-sr-resumo" aria-live="polite">
        {loading ? "Carregando relatório…" : error ?? resumoTexto}
      </p>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="text-center py-5" aria-busy="true">
          <div className="spinner-border text-primary" role="status">
            <span className="sr-only">Carregando…</span>
          </div>
        </div>
      ) : null}

      {data && !error ? (
        <>
          <div className="row relatorio-atendimentos-kpi mb-3">
            <div className="col-6 col-lg-3 mb-2 d-flex">
              <div className="info-box bg-info">
                <span className="info-box-icon">
                  <i className="fas fa-user-md" aria-hidden />
                </span>
                <div className="info-box-content">
                  <span className="info-box-text">Atendimentos</span>
                  <span className="info-box-number">{data.resumo.total_atendimentos}</span>
                </div>
              </div>
            </div>
            <div className="col-6 col-lg-3 mb-2 d-flex">
              <div className="info-box bg-success">
                <span className="info-box-icon">
                  <i className="fas fa-coins" aria-hidden />
                </span>
                <div className="info-box-content">
                  <span className="info-box-text">Valor total</span>
                  <span className="info-box-number small">{fmtBrl(data.resumo.valor_total)}</span>
                </div>
              </div>
            </div>
            <div className="col-6 col-lg-3 mb-2 d-flex">
              <div className="info-box bg-warning">
                <span className="info-box-icon">
                  <i className="fas fa-receipt" aria-hidden />
                </span>
                <div className="info-box-content">
                  <span className="info-box-text">Ticket médio</span>
                  <span className="info-box-number small">{fmtBrl(data.resumo.ticket_medio)}</span>
                </div>
              </div>
            </div>
            <div className="col-6 col-lg-3 mb-2 d-flex">
              <div className="info-box bg-secondary">
                <span className="info-box-icon">
                  <i className="fas fa-redo" aria-hidden />
                </span>
                <div className="info-box-content">
                  <span className="info-box-text">Retornos</span>
                  <span className="info-box-number">{data.retornos.resumo.solicitados}</span>
                </div>
              </div>
            </div>
          </div>

          {data.resumo.total_produtos_lancados > 0 ? (
            <div className="row relatorio-atendimentos-kpi mb-3">
              <div className="col-6 col-lg-3 mb-2 d-flex">
                <div className="info-box bg-primary">
                  <span className="info-box-icon">
                    <i className="fas fa-box-open" aria-hidden />
                  </span>
                  <div className="info-box-content">
                    <span className="info-box-text">Unidades vendidas</span>
                    <span className="info-box-number">{data.resumo.total_produtos_lancados}</span>
                  </div>
                </div>
              </div>
              <div className="col-6 col-lg-3 mb-2 d-flex">
                <div className="info-box bg-teal">
                  <span className="info-box-icon">
                    <i className="fas fa-shopping-bag" aria-hidden />
                  </span>
                  <div className="info-box-content">
                    <span className="info-box-text">Valor em produtos</span>
                    <span className="info-box-number small">
                      {fmtBrl(data.resumo.valor_produtos)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="col-6 col-lg-3 mb-2 d-flex">
                <div className="info-box bg-indigo">
                  <span className="info-box-icon">
                    <i className="fas fa-tags" aria-hidden />
                  </span>
                  <div className="info-box-content">
                    <span className="info-box-text">Produtos distintos</span>
                    <span className="info-box-number">{data.resumo.produtos_distintos}</span>
                  </div>
                </div>
              </div>
              <div className="col-6 col-lg-3 mb-2 d-flex">
                <div className="info-box bg-orange">
                  <span className="info-box-icon">
                    <i className="fas fa-procedures" aria-hidden />
                  </span>
                  <div className="info-box-content">
                    <span className="info-box-text">Procedimentos</span>
                    <span className="info-box-number">{data.resumo.total_procedimentos_lancados}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="d-flex flex-wrap justify-content-between align-items-center mb-2">
            <p className="small text-muted mb-2 mb-md-0">
              Período: <strong>{fmtDataRef(data.periodo.data_inicio)}</strong> a{" "}
              <strong>{fmtDataRef(data.periodo.data_fim)}</strong>
            </p>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary mb-2"
              onClick={exportarCsv}
              disabled={data.por_podologo.length === 0}
            >
              <i className="fas fa-download mr-1" aria-hidden />
              Exportar CSV
            </button>
          </div>

          <div className="row">
            <div className="col-12 col-xl-6 mb-3 d-flex">
              <div className="card relatorio-atendimentos-chart-card h-100 w-100">
                <div className="card-header py-2">
                  <h3 className="card-title h6 mb-0">Atendimentos por podólogo</h3>
                </div>
                <div className="card-body">
                  <GraficoAtendimentosPorPodologo data={data} />
                </div>
              </div>
            </div>
            <div className="col-12 col-xl-6 mb-3 d-flex">
              <div className="card relatorio-atendimentos-chart-card h-100 w-100">
                <div className="card-header py-2">
                  <h3 className="card-title h6 mb-0">Retornos (curativos)</h3>
                </div>
                <div className="card-body">
                  <GraficoRetornos data={data} />
                </div>
              </div>
            </div>
            <div className="col-12 col-lg-4 mb-3 d-flex">
              <div className="card relatorio-atendimentos-chart-card h-100 w-100">
                <div className="card-header py-2">
                  <h3 className="card-title h6 mb-0">Procedimentos (serviços)</h3>
                </div>
                <div className="card-body">
                  <GraficoProcedimentosPizza data={data} />
                </div>
              </div>
            </div>
            <div className="col-12 col-lg-4 mb-3 d-flex">
              <div className="card relatorio-atendimentos-chart-card h-100 w-100">
                <div className="card-header py-2">
                  <h3 className="card-title h6 mb-0">Produtos (mercadorias)</h3>
                </div>
                <div className="card-body">
                  <GraficoProdutosPizza data={data} />
                </div>
              </div>
            </div>
            <div className="col-12 col-lg-4 mb-3 d-flex">
              <div className="card relatorio-atendimentos-chart-card h-100 w-100">
                <div className="card-header py-2">
                  <h3 className="card-title h6 mb-0">Por status</h3>
                </div>
                <div className="card-body">
                  <GraficoStatusPizza data={data} />
                </div>
              </div>
            </div>
            {data.por_dia.length > 1 ? (
              <div className="col-12 mb-3">
                <div className="card relatorio-atendimentos-chart-card">
                  <div className="card-header py-2">
                    <h3 className="card-title h6 mb-0">Evolução diária</h3>
                  </div>
                  <div className="card-body">
                    <GraficoAtendimentosPorDia data={data} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="row">
            <div className="col-12 col-xl-4 mb-3 d-flex">
              <div className="card w-100">
                <div className="card-header py-2">
                  <h3 className="card-title h6 mb-0">Ranking de podólogos</h3>
                </div>
                <div className="card-body p-0 table-responsive">
                  <table className="table table-sm table-hover mb-0">
                    <thead>
                      <tr>
                        <th scope="col" className="relatorio-atendimentos-tabela-rank">
                          #
                        </th>
                        <th scope="col">Podólogo</th>
                        <th scope="col" className="text-right">
                          Qtd
                        </th>
                        <th scope="col" className="text-right">
                          Valor
                        </th>
                        <th scope="col" className="text-right d-none d-md-table-cell">
                          % qtd
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.por_podologo.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-muted text-center py-3">
                            Nenhum atendimento no período.
                          </td>
                        </tr>
                      ) : (
                        data.por_podologo.map((p) => (
                          <tr key={p.id_usuario}>
                            <td className="relatorio-atendimentos-tabela-rank">{p.rank_quantidade}</td>
                            <td>{p.nome}</td>
                            <td className="text-right">{p.quantidade}</td>
                            <td className="text-right">{fmtBrl(p.valor_total)}</td>
                            <td className="text-right d-none d-md-table-cell">
                              {p.percentual_quantidade}%
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-12 col-xl-4 mb-3 d-flex">
              <div className="card w-100">
                <div className="card-header py-2">
                  <h3 className="card-title h6 mb-0">Ranking de procedimentos</h3>
                </div>
                <div className="card-body p-0 table-responsive">
                  <table className="table table-sm table-hover mb-0">
                    <thead>
                      <tr>
                        <th scope="col" className="relatorio-atendimentos-tabela-rank">
                          #
                        </th>
                        <th scope="col">Procedimento</th>
                        <th scope="col" className="text-right">
                          Qtd
                        </th>
                        <th scope="col" className="text-right d-none d-sm-table-cell">
                          Valor
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.por_procedimento.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted text-center py-3">
                            Nenhum procedimento lançado.
                          </td>
                        </tr>
                      ) : (
                        data.por_procedimento.map((p) => (
                          <tr key={p.id_procedimento}>
                            <td className="relatorio-atendimentos-tabela-rank">{p.rank}</td>
                            <td>{p.nome}</td>
                            <td className="text-right">{p.quantidade}</td>
                            <td className="text-right d-none d-sm-table-cell">
                              {fmtBrl(p.valor_total)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-12 col-xl-4 mb-3 d-flex">
              <div className="card w-100">
                <div className="card-header py-2">
                  <h3 className="card-title h6 mb-0">Ranking de produtos</h3>
                </div>
                <div className="card-body p-0 table-responsive">
                  <table className="table table-sm table-hover mb-0">
                    <thead>
                      <tr>
                        <th scope="col" className="relatorio-atendimentos-tabela-rank">
                          #
                        </th>
                        <th scope="col">Produto</th>
                        <th scope="col" className="text-right">
                          Unid.
                        </th>
                        <th scope="col" className="text-right d-none d-sm-table-cell">
                          Valor
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.por_produto.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted text-center py-3">
                            Nenhum produto lançado.
                          </td>
                        </tr>
                      ) : (
                        data.por_produto.map((p) => (
                          <tr key={p.id_produto}>
                            <td className="relatorio-atendimentos-tabela-rank">{p.rank}</td>
                            <td>{p.nome}</td>
                            <td className="text-right">{p.quantidade}</td>
                            <td className="text-right d-none d-sm-table-cell">
                              {fmtBrl(p.valor_total)}
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
      ) : null}
    </div>
  );
}
