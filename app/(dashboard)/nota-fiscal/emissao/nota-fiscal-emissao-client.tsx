"use client";

import { limitesSemanaInclusive, rotuloSemanaPt } from "@/lib/agenda/datas-agenda";
import type { NotaFiscalAtendimentoRow } from "@/lib/financeiro/nota-fiscal-atendimentos-rows";
import { useCallback, useEffect, useState } from "react";
import { ModalEmissaoNfse } from "./modal-emissao-nfse";
import { ModalParametrosFocusNfe } from "./modal-parametros-focusnfe";

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

type Props = {
  /** Parâmetros Focus NFe — somente Administrador / Administrativo. */
  exibirParametros?: boolean;
};

export function NotaFiscalEmissaoClient({ exibirParametros = true }: Props) {
  const hoje = dataLocalYmd();
  const semanaPadrao = limitesSemanaInclusive(hoje);

  const [dataInicio, setDataInicio] = useState(semanaPadrao.inicio);
  const [dataFim, setDataFim] = useState(semanaPadrao.fim);
  const [paciente, setPaciente] = useState("");
  const [pacienteAplicado, setPacienteAplicado] = useState("");
  const [rows, setRows] = useState<NotaFiscalAtendimentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalParametros, setModalParametros] = useState(false);
  const [rowEmissao, setRowEmissao] = useState<NotaFiscalAtendimentoRow | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        data_inicio: dataInicio,
        data_fim: dataFim,
      });
      const termo = pacienteAplicado.trim();
      if (termo.length >= 2) qs.set("paciente", termo);

      const res = await fetch(
        `/api/nota-fiscal/emissao?${qs.toString()}`,
        { credentials: "include" },
      );
      const j = (await res.json()) as {
        rows?: NotaFiscalAtendimentoRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar atendimentos.");
      setRows(j.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, pacienteAplicado]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const buscar = () => {
    const termo = paciente.trim();
    if (termo.length > 0 && termo.length < 2) {
      setError("Informe ao menos 2 caracteres no nome do paciente.");
      return;
    }
    setPacienteAplicado(termo);
  };

  const aplicarSemanaAtual = () => {
    const { inicio, fim } = limitesSemanaInclusive(hoje);
    setDataInicio(inicio);
    setDataFim(fim);
    setPacienteAplicado(paciente.trim());
  };

  const totalValor = rows.reduce((s, r) => s + r.valor_total, 0);

  return (
    <>
      {exibirParametros ? (
        <div className="d-flex flex-wrap justify-content-end mb-2">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => setModalParametros(true)}
          >
            <i className="fas fa-cog mr-1" aria-hidden />
            Parâmetros Focus NFe
          </button>
        </div>
      ) : null}

      <div className="card card-outline card-primary mb-3">
        <div className="card-header">
          <h3 className="card-title mb-0">Filtros</h3>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-12 col-md-4 col-lg-3">
              <div className="form-group mb-md-0">
                <label htmlFor="nf-emissao-inicio">Data início</label>
                <input
                  id="nf-emissao-inicio"
                  type="date"
                  className="form-control"
                  value={dataInicio}
                  max={dataFim}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
            </div>
            <div className="col-12 col-md-4 col-lg-3">
              <div className="form-group mb-md-0">
                <label htmlFor="nf-emissao-fim">Data fim</label>
                <input
                  id="nf-emissao-fim"
                  type="date"
                  className="form-control"
                  value={dataFim}
                  min={dataInicio}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
            </div>
            <div className="col-12 col-md-4 col-lg-4">
              <div className="form-group mb-md-0">
                <label htmlFor="nf-emissao-paciente">Nome do paciente</label>
                <input
                  id="nf-emissao-paciente"
                  type="search"
                  className="form-control"
                  placeholder="Opcional — mín. 2 caracteres"
                  value={paciente}
                  onChange={(e) => setPaciente(e.target.value)}
                />
              </div>
            </div>
            <div className="col-12 col-lg-2 d-flex align-items-end">
              <button
                type="button"
                className="btn btn-primary btn-block mb-2 mb-lg-0"
                disabled={loading}
                onClick={buscar}
              >
                {loading ? "Buscando…" : "Buscar"}
              </button>
            </div>
          </div>
          <div className="d-flex flex-wrap align-items-center mt-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary mr-2 mb-1"
              onClick={aplicarSemanaAtual}
            >
              Semana atual
            </button>
            <span className="small text-muted mb-1">
              Padrão: {rotuloSemanaPt(semanaPadrao.inicio, semanaPadrao.fim)} (seg–dom)
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="card card-outline card-primary">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div>
            <h3 className="card-title mb-0">Atendimentos com pagamento quitado</h3>
            <p className="text-muted small mb-0 mt-1">
              Período de <strong>{fmtDataRef(dataInicio)}</strong> a{" "}
              <strong>{fmtDataRef(dataFim)}</strong> — apenas agendamentos{" "}
              <strong>realizados</strong> com baixa completa no caixa (todos os
              pagamentos com status <strong>pago</strong>).
            </p>
          </div>
          {!loading && rows.length > 0 ? (
            <div className="text-right small">
              <div>
                <strong>{rows.length}</strong> atendimento
                {rows.length === 1 ? "" : "s"}
              </div>
              <div className="text-muted">Total {fmtBrl(totalValor)}</div>
            </div>
          ) : null}
        </div>
        <div className="card-body table-responsive p-0">
          <table className="table table-hover table-striped table-sm mb-0">
            <thead>
              <tr>
                <th style={{ width: "72px" }}>ID</th>
                <th style={{ minWidth: "130px" }}>Início</th>
                <th style={{ minWidth: "160px" }}>Paciente</th>
                <th style={{ minWidth: "120px" }}>Profissional</th>
                <th>Sala</th>
                <th className="text-right" style={{ minWidth: "88px" }}>
                  Total
                </th>
                <th style={{ minWidth: "200px" }}>Procedimentos</th>
                <th style={{ minWidth: "180px" }}>Pagamentos</th>
                <th style={{ width: "56px" }} className="text-center">
                  NFS-e
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center text-muted py-4">
                    <span
                      className="spinner-border spinner-border-sm mr-2 align-middle"
                      role="status"
                      aria-hidden
                    />
                    Carregando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-muted py-4">
                    Nenhum atendimento quitado no período
                    {pacienteAplicado.trim().length >= 2
                      ? ` para “${pacienteAplicado.trim()}”`
                      : ""}
                    .
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td className="text-nowrap">{fmtDataHora(r.data_hora_inicio)}</td>
                    <td>{r.paciente_nome}</td>
                    <td>{r.profissional_nome}</td>
                    <td>{r.nome_sala}</td>
                    <td className="text-right text-nowrap font-weight-bold">
                      {fmtBrl(r.valor_total)}
                    </td>
                    <td className="small">
                      <ul className="list-unstyled mb-0">
                        {r.procedimentos.length === 0 ? (
                          <li className="text-muted">—</li>
                        ) : (
                          r.procedimentos.map((p, i) => (
                            <li key={i}>
                              {(p.procedimento ?? "Procedimento").trim()}{" "}
                              <span className="text-muted">
                                ({fmtBrl(p.valor_aplicado)})
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    </td>
                    <td className="small">
                      <ul className="list-unstyled mb-0">
                        {r.pagamentos.map((p, i) => (
                          <li key={i}>
                            {fmtBrl(p.valor_pago)}{" "}
                            <span className="text-muted">
                              · {p.forma ?? "Forma"}
                              {p.maquineta ? ` · ${p.maquineta}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="text-center align-middle">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        title="Emitir NFS-e"
                        aria-label={`Emitir NFS-e para ${r.paciente_nome}`}
                        onClick={() => setRowEmissao(r)}
                      >
                        <i className="fas fa-file-invoice" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {exibirParametros ? (
        <ModalParametrosFocusNfe
          aberto={modalParametros}
          onFechar={() => setModalParametros(false)}
        />
      ) : null}
      <ModalEmissaoNfse
        row={rowEmissao}
        onFechar={() => setRowEmissao(null)}
        onEmitido={() => void carregar()}
      />
    </>
  );
}
