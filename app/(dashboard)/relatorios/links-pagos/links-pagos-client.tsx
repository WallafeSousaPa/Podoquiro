"use client";

import { useCallback, useEffect, useState } from "react";
import {
  periodoMesAtualYmd,
  periodoMesPassadoYmd,
  type LinkPagoRow,
  type LinksPagosData,
} from "@/lib/relatorios/links-pagos";
import { DATA_YMD_RE } from "@/lib/relatorios/periodo";
import { GraficoLinksPagosPorMeio } from "./links-pagos-charts";
import { ModalDetalheAtendimentoLinksPagos } from "./modal-detalhe-atendimento";
import "./links-pagos.css";

const COOKIE_PERIODO = "podoquiro_rel_links_pagos_periodo";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365; // 1 ano

function dataLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function fmtDataHora(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function lerCookie(nome: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(nome)}=`;
  for (const part of document.cookie.split(";")) {
    const t = part.trim();
    if (t.startsWith(prefix)) {
      return decodeURIComponent(t.slice(prefix.length));
    }
  }
  return null;
}

function escreverCookie(nome: string, valor: string) {
  if (typeof document === "undefined") return;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${encodeURIComponent(nome)}=${encodeURIComponent(valor)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`;
}

function lerPeriodoSalvo(): { dataInicio: string; dataFim: string } | null {
  const raw = lerCookie(COOKIE_PERIODO);
  if (!raw) return null;
  const [inicio, fim] = raw.split("|");
  if (!inicio || !fim || !DATA_YMD_RE.test(inicio) || !DATA_YMD_RE.test(fim)) {
    return null;
  }
  if (inicio > fim) return null;
  return { dataInicio: inicio, dataFim: fim };
}

function salvarPeriodo(dataInicio: string, dataFim: string) {
  if (!DATA_YMD_RE.test(dataInicio) || !DATA_YMD_RE.test(dataFim)) return;
  if (dataInicio > dataFim) return;
  escreverCookie(COOKIE_PERIODO, `${dataInicio}|${dataFim}`);
}

export function LinksPagosClient() {
  const hoje = dataLocalYmd();
  const mesAtual = periodoMesAtualYmd();

  const [dataInicio, setDataInicio] = useState(mesAtual.dataInicio);
  const [dataFim, setDataFim] = useState(mesAtual.dataFim);
  const [periodoPronto, setPeriodoPronto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LinksPagosData | null>(null);
  const [modalRow, setModalRow] = useState<LinkPagoRow | null>(null);

  useEffect(() => {
    const salvo = lerPeriodoSalvo();
    if (salvo) {
      setDataInicio(salvo.dataInicio);
      setDataFim(salvo.dataFim);
    }
    setPeriodoPronto(true);
  }, []);

  useEffect(() => {
    if (!periodoPronto) return;
    salvarPeriodo(dataInicio, dataFim);
  }, [dataInicio, dataFim, periodoPronto]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/relatorios/links-pagos?data_inicio=${encodeURIComponent(
        dataInicio,
      )}&data_fim=${encodeURIComponent(dataFim)}`;
      const res = await fetch(url, { credentials: "include" });
      const j = (await res.json()) as { data?: LinksPagosData; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar relatório.");
      setData(j.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim]);

  useEffect(() => {
    if (!periodoPronto) return;
    void carregar();
  }, [carregar, periodoPronto]);

  const aplicarMesAtual = () => {
    const p = periodoMesAtualYmd();
    setDataInicio(p.dataInicio);
    setDataFim(p.dataFim);
  };

  const aplicarMesPassado = () => {
    const p = periodoMesPassadoYmd();
    setDataInicio(p.dataInicio);
    setDataFim(p.dataFim);
  };

  const exportarCsv = () => {
    if (!data) return;
    const linhas: string[] = [
      "Relatório de links pagos",
      `Período;${fmtDataRef(data.periodo.data_inicio)};${fmtDataRef(data.periodo.data_fim)}`,
      `Quantidade;${data.resumo.quantidade}`,
      `Valor total;${data.resumo.valor_total.toFixed(2)}`,
      "",
      "Por meio",
      "Meio;Quantidade;Valor",
    ];
    for (const m of data.por_meio) {
      linhas.push(`${m.rotulo};${m.quantidade};${m.valor.toFixed(2)}`);
    }
    linhas.push(
      "",
      "Dia;Atendimento;Paciente;Profissional;Data atendimento;Forma de pagamento;Meio;Valor (link pago)",
    );
    for (const r of data.rows) {
      linhas.push(
        [
          fmtDataRef(r.dia),
          `#${r.id_agendamento}`,
          r.paciente,
          r.profissional,
          fmtDataHora(r.data_hora_atendimento),
          r.forma_pagamento,
          r.meio,
          r.valor.toFixed(2),
        ].join(";"),
      );
    }
    const blob = new Blob(["\uFEFF" + linhas.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `links-pagos-${data.periodo.data_inicio}-${data.periodo.data_fim}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="links-pagos-page">
      <div className="card card-outline card-primary links-pagos-filtros">
        <div className="card-header">
          <h3 className="card-title">Filtros</h3>
        </div>
        <div className="card-body">
          <div className="form-row align-items-end">
            <div className="form-group col-12 col-sm-6 col-md-3">
              <label htmlFor="lp-data-inicio">Data início</label>
              <input
                id="lp-data-inicio"
                type="date"
                className="form-control"
                value={dataInicio}
                max={dataFim}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="form-group col-12 col-sm-6 col-md-3">
              <label htmlFor="lp-data-fim">Data fim</label>
              <input
                id="lp-data-fim"
                type="date"
                className="form-control"
                value={dataFim}
                min={dataInicio}
                max={hoje}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <div className="form-group col-12 col-md-6">
              <label className="d-block">Atalhos</label>
              <div className="btn-group btn-group-sm" role="group">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={aplicarMesAtual}
                >
                  Mês atual
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={aplicarMesPassado}
                >
                  Mês passado
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void carregar()}
                >
                  <i className="fas fa-sync-alt mr-1" aria-hidden /> Atualizar
                </button>
                <button
                  type="button"
                  className="btn btn-outline-success"
                  onClick={exportarCsv}
                  disabled={!data || data.rows.length === 0}
                >
                  <i className="fas fa-file-csv mr-1" aria-hidden /> CSV
                </button>
              </div>
            </div>
          </div>
          <p className="text-muted small mb-0">
            Atendimentos com link de pagamento (Asaas/Rede) quitado no período,
            pela data do pagamento. Toque em um item para ver o detalhe.
            O período escolhido fica salvo neste navegador.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      {!periodoPronto || loading ? (
        <div className="text-center text-muted py-5">
          <i className="fas fa-spinner fa-spin mr-2" aria-hidden /> Carregando…
        </div>
      ) : !data ? null : (
        <>
          <div className="row links-pagos-kpi">
            <div className="col-6 col-lg-3">
              <div className="small-box bg-info">
                <div className="inner">
                  <h3>{data.resumo.quantidade}</h3>
                  <p>Links pagos</p>
                </div>
                <div className="icon d-none d-sm-block">
                  <i className="fas fa-link" aria-hidden />
                </div>
              </div>
            </div>
            <div className="col-6 col-lg-3">
              <div className="small-box bg-success">
                <div className="inner">
                  <h3>{fmtBrl(data.resumo.valor_total)}</h3>
                  <p>Valor total</p>
                </div>
                <div className="icon d-none d-sm-block">
                  <i className="fas fa-dollar-sign" aria-hidden />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title mb-0">Pagamentos por meio</h3>
            </div>
            <div className="card-body">
              <GraficoLinksPagosPorMeio data={data} />
              <div className="table-responsive mt-3">
                <table className="table table-sm table-bordered mb-0">
                  <thead>
                    <tr>
                      <th>Meio</th>
                      <th className="text-center">Qtd</th>
                      <th className="text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.por_meio.map((m) => (
                      <tr key={m.meio}>
                        <td>{m.rotulo}</td>
                        <td className="text-center">{m.quantidade}</td>
                        <td className="text-right">{fmtBrl(m.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title mb-0">Links pagos no período</h3>
            </div>

            <div className="card-body table-responsive p-0 links-pagos-lista-desktop">
              <table className="table table-hover table-striped mb-0">
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Atendimento</th>
                    <th>Forma de pagamento</th>
                    <th className="text-right">Link pago</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-4">
                        Nenhum link pago no período.
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((r) => (
                      <tr
                        key={r.id_taxa}
                        style={{ cursor: "pointer" }}
                        title="Ver detalhes do atendimento"
                        onClick={() => setModalRow(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setModalRow(r);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                      >
                        <td className="text-nowrap">{fmtDataRef(r.dia)}</td>
                        <td>
                          <div>
                            <strong>#{r.id_agendamento}</strong> — {r.paciente}
                          </div>
                          <div className="text-muted small">
                            {fmtDataHora(r.data_hora_atendimento)}
                            {r.profissional !== "—"
                              ? ` · ${r.profissional}`
                              : null}
                          </div>
                        </td>
                        <td>{r.forma_pagamento}</td>
                        <td className="text-right text-nowrap font-weight-bold">
                          {fmtBrl(r.valor)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="links-pagos-lista-mobile">
              {data.rows.length === 0 ? (
                <p className="text-center text-muted py-4 mb-0">
                  Nenhum link pago no período.
                </p>
              ) : (
                data.rows.map((r) => (
                  <div
                    key={r.id_taxa}
                    className="links-pagos-card-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => setModalRow(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setModalRow(r);
                      }
                    }}
                  >
                    <div className="links-pagos-card-top">
                      <div>
                        <div className="small text-muted">{fmtDataRef(r.dia)}</div>
                        <div>
                          <strong>#{r.id_agendamento}</strong> — {r.paciente}
                        </div>
                      </div>
                      <div className="links-pagos-card-valor text-success">
                        {fmtBrl(r.valor)}
                      </div>
                    </div>
                    <div className="small text-muted">
                      {r.forma_pagamento}
                      {r.profissional !== "—" ? ` · ${r.profissional}` : null}
                    </div>
                    <div className="small text-muted">
                      {fmtDataHora(r.data_hora_atendimento)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {modalRow ? (
        <ModalDetalheAtendimentoLinksPagos
          row={modalRow}
          onClose={() => setModalRow(null)}
        />
      ) : null}
    </div>
  );
}
