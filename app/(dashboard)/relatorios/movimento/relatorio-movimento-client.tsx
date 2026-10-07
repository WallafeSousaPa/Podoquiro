"use client";

import type {
  LinhaRelatorioMovimento,
  RelatorioMovimentoData,
} from "@/lib/relatorios/movimento";
import { useCallback, useEffect, useState } from "react";
import { ModalDetalheMovimento } from "./modal-detalhe-movimento";
import "./relatorio-movimento.css";

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

function periodoMesAtualYmd(): { dataInicio: string; dataFim: string } {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, d.getMonth() + 1, 0).getDate();
  return {
    dataInicio: `${y}-${m}-01`,
    dataFim: `${y}-${m}-${String(last).padStart(2, "0")}`,
  };
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

export function RelatorioMovimentoClient() {
  const hoje = dataLocalYmd();
  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RelatorioMovimentoData | null>(null);
  const [linhaDetalhe, setLinhaDetalhe] = useState<LinhaRelatorioMovimento | null>(null);

  const aplicarHoje = () => {
    const d = dataLocalYmd();
    setDataInicio(d);
    setDataFim(d);
  };

  const aplicar7Dias = () => {
    const d = dataLocalYmd();
    setDataInicio(ymdMenosDias(d, 6));
    setDataFim(d);
  };

  const aplicarMesAtual = () => {
    const p = periodoMesAtualYmd();
    setDataInicio(p.dataInicio);
    setDataFim(p.dataFim);
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        data_inicio: dataInicio,
        data_fim: dataFim,
      });
      const res = await fetch(`/api/relatorios/movimento?${q.toString()}`, {
        credentials: "include",
      });
      const j = (await res.json()) as { data?: RelatorioMovimentoData; error?: string };
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
    void carregar();
  }, [carregar]);

  const periodoLabel =
    dataInicio === dataFim
      ? fmtDataRef(dataInicio)
      : `${fmtDataRef(dataInicio)} a ${fmtDataRef(dataFim)}`;

  return (
    <div className="relatorio-movimento">
      <div className="card card-outline card-primary relatorio-movimento-filtros no-print">
        <div className="card-header">
          <h3 className="card-title mb-0">Filtro por período</h3>
        </div>
        <div className="card-body">
          <div className="form-row align-items-end">
            <div className="form-group col-12 col-sm-6 col-md-3">
              <label htmlFor="rel-mov-ini">Data início</label>
              <input
                id="rel-mov-ini"
                type="date"
                className="form-control"
                value={dataInicio}
                max={dataFim}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="form-group col-12 col-sm-6 col-md-3">
              <label htmlFor="rel-mov-fim">Data fim</label>
              <input
                id="rel-mov-fim"
                type="date"
                className="form-control"
                value={dataFim}
                min={dataInicio}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <div className="form-group col-12 col-md-6">
              <label className="d-block">Atalhos</label>
              <div className="btn-group btn-group-sm flex-wrap" role="group">
                <button type="button" className="btn btn-outline-secondary" onClick={aplicarHoje}>
                  Hoje
                </button>
                <button type="button" className="btn btn-outline-secondary" onClick={aplicar7Dias}>
                  7 dias
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={aplicarMesAtual}
                >
                  Mês atual
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
                  className="btn btn-outline-dark"
                  onClick={() => window.print()}
                  disabled={!data}
                >
                  <i className="fas fa-print mr-1" aria-hidden /> Imprimir
                </button>
              </div>
            </div>
          </div>
          <p className="text-muted small mb-0">
            Totais iguais ao Caixa: pagamentos quitados dos atendimentos do dia e taxas/links
            recebidos no período. PIX, link e cartão mostram a maquineta. Clique na forma para
            ver os lançamentos. Intervalo com mais de um dia sai consolidado.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-danger no-print">{error}</div> : null}

      {loading ? (
        <div className="text-center text-muted py-5 no-print">
          <i className="fas fa-spinner fa-spin mr-2" aria-hidden /> Carregando…
        </div>
      ) : !data ? null : (
        <>
          <div className="relatorio-movimento-print-titulo d-none d-print-block mb-3">
            <h2 className="h4 mb-1">Relatório de movimento</h2>
            <p className="mb-0 text-muted">{periodoLabel}</p>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title mb-0">Movimento — {periodoLabel}</h3>
              <div className="card-tools">
                <span className="badge badge-light">
                  {data.quantidade} lançamento{data.quantidade === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <div className="card-body table-responsive p-0">
              <table className="table table-sm table-striped table-hover mb-0 relatorio-movimento-tabela">
                <thead>
                  <tr>
                    <th>Forma de pagamento</th>
                    <th>Maquineta</th>
                    <th className="text-center" style={{ width: "7rem" }}>
                      Qtd
                    </th>
                    <th className="text-right" style={{ width: "10rem" }}>
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.linhas.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-4">
                        Nenhuma entrada no período.
                      </td>
                    </tr>
                  ) : (
                    data.linhas.map((l) => (
                      <tr key={l.chave}>
                        <td>
                          <button
                            type="button"
                            className="btn btn-link p-0 text-left relatorio-movimento-link"
                            title="Ver lançamentos desta forma"
                            onClick={() => setLinhaDetalhe(l)}
                          >
                            {l.forma}
                          </button>
                        </td>
                        <td>{l.maquineta ?? "—"}</td>
                        <td className="text-center">{l.quantidade}</td>
                        <td className="text-right">{fmtBrl(l.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {data.linhas.length > 0 ? (
                  <tfoot>
                    <tr>
                      <th colSpan={2}>Total</th>
                      <th className="text-center">{data.quantidade}</th>
                      <th className="text-right">{fmtBrl(data.total)}</th>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
        </>
      )}

      {linhaDetalhe ? (
        <ModalDetalheMovimento
          linha={linhaDetalhe}
          onClose={() => setLinhaDetalhe(null)}
        />
      ) : null}
    </div>
  );
}
