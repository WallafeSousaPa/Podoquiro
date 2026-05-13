"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  CaixaClient,
  type CaixaAgendamentoRow,
} from "../caixa/caixa-client";
import { ModalCaixaAgendamento } from "../caixa/modal-caixa-agendamento";
import "../caixa/caixa.css";

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

function fmtDataRef(ymd: string) {
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
  } catch {
    return ymd;
  }
}

type LancamentoRow = {
  id: number;
  tipo: string;
  numero_caixa: string;
  data_referencia: string;
  data_lancamento: string;
  responsavel_nome: string;
  relatorio: {
    valor_dinheiro: number;
    valor_cartao_credito: number;
    valor_cartao_debito: number;
    valor_pix: number;
    criado_em: string;
  } | null;
};

type HistoricoJson = {
  lancamentos?: LancamentoRow[];
  error?: string;
};

/** Todos os pagamentos do agendamento com status pago — modal só leitura (igual à tela Caixa). */
function todosPagamentosQuitadosNaLista(r: CaixaAgendamentoRow): boolean {
  return (
    r.pagamentos.length > 0 &&
    r.pagamentos.every((p) => p.status_pagamento === "pago")
  );
}

export function RelatorioCaixaClient() {
  const hoje = dataLocalYmd();
  const [dataInicio, setDataInicio] = useState(() => ymdMenosDias(hoje, 30));
  const [dataFim, setDataFim] = useState(hoje);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<LancamentoRow[]>([]);

  const modalDiaId = useId();
  const [diaDetalheModal, setDiaDetalheModal] = useState<string | null>(null);
  const [modalAgRows, setModalAgRows] = useState<CaixaAgendamentoRow[]>([]);
  const [modalAgLoading, setModalAgLoading] = useState(false);
  const [modalAgError, setModalAgError] = useState<string | null>(null);
  const [modalRowAgendamento, setModalRowAgendamento] =
    useState<CaixaAgendamentoRow | null>(null);

  const carregarAgendamentosDia = useCallback(async (ymd: string) => {
    setModalAgLoading(true);
    setModalAgError(null);
    try {
      const res = await fetch(
        `/api/financeiro/caixa/agendamentos-pagos?data=${encodeURIComponent(ymd)}`,
      );
      const j = (await res.json()) as { rows?: CaixaAgendamentoRow[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar agendamentos.");
      const list = Array.isArray(j.rows) ? j.rows : [];
      list.sort((a, b) => {
        const ta = new Date(a.data_hora_inicio).getTime();
        const tb = new Date(b.data_hora_inicio).getTime();
        if (ta !== tb) return ta - tb;
        return a.id - b.id;
      });
      setModalAgRows(list);
    } catch (e) {
      setModalAgError(
        e instanceof Error ? e.message : "Não foi possível carregar o dia.",
      );
      setModalAgRows([]);
    } finally {
      setModalAgLoading(false);
    }
  }, []);

  const fecharModalDia = useCallback(() => {
    setDiaDetalheModal(null);
    setModalRowAgendamento(null);
    setModalAgRows([]);
    setModalAgError(null);
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        data_inicio: dataInicio,
        data_fim: dataFim,
      });
      const res = await fetch(`/api/financeiro/caixa/historico?${q}`);
      const j = (await res.json()) as HistoricoJson;
      if (!res.ok) throw new Error(j.error ?? "Erro ao consultar histórico.");
      setRows(Array.isArray(j.lancamentos) ? j.lancamentos : []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível carregar os lançamentos.",
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <>
      <div className="card card-outline card-primary mb-3">
        <div className="card-header">
          <h3 className="card-title mb-0">Filtro por período</h3>
        </div>
        <div className="card-body">
          <div className="form-row align-items-end">
            <div className="form-group col-sm-6 col-md-3">
              <label htmlFor="rel-caixa-ini">Data inicial</label>
              <input
                id="rel-caixa-ini"
                type="date"
                className="form-control"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="form-group col-sm-6 col-md-3">
              <label htmlFor="rel-caixa-fim">Data final</label>
              <input
                id="rel-caixa-fim"
                type="date"
                className="form-control"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <div className="form-group col-sm-12 col-md-4">
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading}
                onClick={() => void carregar()}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-1" aria-hidden />
                    Consultando…
                  </>
                ) : (
                  <>
                    <i className="fas fa-search mr-1" aria-hidden />
                    Consultar
                  </>
                )}
              </button>
            </div>
          </div>
          <p className="text-muted small mb-0">
            Período baseado na <strong>data de referência</strong> do caixa (dia
            operacional). No fechamento, os valores são os informados na conferência.
            Clique na <strong>data de referência</strong> na tabela abaixo para ver
            atendimentos e pagamentos daquele dia.
          </p>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title mb-0">Aberturas e fechamentos</h3>
        </div>
        <div className="card-body p-0 table-responsive">
          <table className="table table-striped table-hover mb-0">
            <thead>
              <tr>
                <th scope="col">Data ref.</th>
                <th>Caixa</th>
                <th>Tipo</th>
                <th>Data/hora</th>
                <th>Responsável</th>
                <th className="text-right">Dinheiro</th>
                <th className="text-right">Crédito</th>
                <th className="text-right">Débito</th>
                <th className="text-right">Pix</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-muted py-4">
                    <i className="fas fa-spinner fa-spin mr-2" aria-hidden />
                    Carregando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-muted py-4">
                    Nenhum lançamento no período.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const rel = r.relatorio;
                  const ehFech = r.tipo === "fechamento";
                  return (
                    <tr key={`${r.tipo}-${r.id}`}>
                      <td>
                        <button
                          type="button"
                          className="btn btn-link p-0 text-left font-weight-normal align-baseline"
                          title="Ver atendimentos e pagamentos deste dia"
                          onClick={() => {
                            setModalRowAgendamento(null);
                            setDiaDetalheModal(r.data_referencia);
                            void carregarAgendamentosDia(r.data_referencia);
                          }}
                        >
                          {fmtDataRef(r.data_referencia)}
                        </button>
                      </td>
                      <td>{r.numero_caixa}</td>
                      <td>
                        <span
                          className={`badge ${ehFech ? "badge-success" : "badge-info"}`}
                        >
                          {ehFech ? "Fechamento" : "Abertura"}
                        </span>
                      </td>
                      <td>{fmtDataHora(r.data_lancamento)}</td>
                      <td>{r.responsavel_nome}</td>
                      <td className="text-right">
                        {rel ? fmtBrl(rel.valor_dinheiro) : "—"}
                      </td>
                      <td className="text-right">
                        {rel ? fmtBrl(rel.valor_cartao_credito) : "—"}
                      </td>
                      <td className="text-right">
                        {rel ? fmtBrl(rel.valor_cartao_debito) : "—"}
                      </td>
                      <td className="text-right">
                        {rel ? fmtBrl(rel.valor_pix) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {diaDetalheModal ? (
        <>
          <div
            className="modal fade show"
            style={{ display: "block" }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalDiaId}
          >
            <div
              className="modal-dialog modal-xl modal-dialog-scrollable"
              role="document"
            >
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title" id={modalDiaId}>
                    Atendimentos e pagamentos — {fmtDataRef(diaDetalheModal)}
                  </h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={() => fecharModalDia()}
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
                <div className="modal-body">
                  <CaixaClient
                      rows={modalAgRows}
                      loadError={modalAgError}
                      loadingRows={modalAgLoading}
                      dataRef={diaDetalheModal}
                      onPacienteClick={(row) => setModalRowAgendamento(row)}
                      onAtualizar={() =>
                        void carregarAgendamentosDia(diaDetalheModal)
                      }
                    />
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => fecharModalDia()}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div
            className="modal-backdrop fade show"
            role="presentation"
            onClick={() => fecharModalDia()}
          />
        </>
      ) : null}

      {modalRowAgendamento && diaDetalheModal ? (
        <ModalCaixaAgendamento
          row={modalRowAgendamento}
          somenteVisualizar={todosPagamentosQuitadosNaLista(modalRowAgendamento)}
          onClose={() => setModalRowAgendamento(null)}
          onSaved={() => void carregarAgendamentosDia(diaDetalheModal)}
        />
      ) : null}
    </>
  );
}
