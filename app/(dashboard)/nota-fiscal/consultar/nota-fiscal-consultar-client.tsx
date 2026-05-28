"use client";

import { limitesSemanaInclusive } from "@/lib/agenda/datas-agenda";
import {
  STATUS_NFSE_FOCUS_FILTRO,
  type NfseFocusConsultaRow,
} from "@/lib/financeiro/nfse-focus-consulta";
import { statusInternoDeFocus } from "@/lib/focusnfe";
import { useCallback, useEffect, useState } from "react";

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

function fmtDataHora(iso: string | null) {
  if (!iso) return "—";
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

function badgeStatus(status: string) {
  const interno = statusInternoDeFocus(status);
  if (interno === "autorizado") return "badge-success";
  if (interno === "erro") return "badge-danger";
  return "badge-warning";
}

function rotuloStatus(status: string) {
  const opt = STATUS_NFSE_FOCUS_FILTRO.find((s) => s.value === status);
  if (opt && opt.value) return opt.label;
  return status.replace(/_/g, " ");
}

export function NotaFiscalConsultarClient() {
  const hoje = dataLocalYmd();
  const semanaPadrao = limitesSemanaInclusive(hoje);

  const [dataInicio, setDataInicio] = useState(semanaPadrao.inicio);
  const [dataFim, setDataFim] = useState(semanaPadrao.fim);
  const [status, setStatus] = useState("");
  const [paciente, setPaciente] = useState("");
  const [pacienteAplicado, setPacienteAplicado] = useState("");
  const [rows, setRows] = useState<NfseFocusConsultaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        data_inicio: dataInicio,
        data_fim: dataFim,
      });
      if (status) qs.set("status", status);
      const termo = pacienteAplicado.trim();
      if (termo.length >= 2) qs.set("paciente", termo);

      const res = await fetch(`/api/nota-fiscal/consultar?${qs.toString()}`, {
        credentials: "include",
      });
      const j = (await res.json()) as {
        rows?: NfseFocusConsultaRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar NFS-e.");
      setRows(j.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, status, pacienteAplicado]);

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

  const totalValor = rows.reduce((s, r) => s + r.valor_servicos, 0);

  return (
    <>
      <div className="card card-outline card-primary mb-3">
        <div className="card-header">
          <h3 className="card-title mb-0">Filtros</h3>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-12 col-md-6 col-lg-3">
              <div className="form-group mb-md-0">
                <label htmlFor="nf-consulta-inicio">Data início</label>
                <input
                  id="nf-consulta-inicio"
                  type="date"
                  className="form-control"
                  value={dataInicio}
                  max={dataFim}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
            </div>
            <div className="col-12 col-md-6 col-lg-3">
              <div className="form-group mb-md-0">
                <label htmlFor="nf-consulta-fim">Data fim</label>
                <input
                  id="nf-consulta-fim"
                  type="date"
                  className="form-control"
                  value={dataFim}
                  min={dataInicio}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
            </div>
            <div className="col-12 col-md-6 col-lg-2">
              <div className="form-group mb-md-0">
                <label htmlFor="nf-consulta-status">Status</label>
                <select
                  id="nf-consulta-status"
                  className="form-control"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {STATUS_NFSE_FOCUS_FILTRO.map((s) => (
                    <option key={s.value || "todos"} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="col-12 col-md-6 col-lg-3">
              <div className="form-group mb-md-0">
                <label htmlFor="nf-consulta-paciente">Nome do paciente</label>
                <input
                  id="nf-consulta-paciente"
                  type="search"
                  className="form-control"
                  placeholder="Opcional — mín. 2 caracteres"
                  value={paciente}
                  onChange={(e) => setPaciente(e.target.value)}
                />
              </div>
            </div>
            <div className="col-12 col-lg-1 d-flex align-items-end">
              <button
                type="button"
                className="btn btn-primary btn-block mb-2 mb-lg-0"
                disabled={loading}
                onClick={buscar}
              >
                {loading ? "…" : "Buscar"}
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
              Emissões de {fmtDataRef(dataInicio)} a {fmtDataRef(dataFim)}
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
            <h3 className="card-title mb-0">NFS-e emitidas</h3>
            <p className="text-muted small mb-0 mt-1">
              Notas enviadas via Focus NFe no período selecionado.
            </p>
          </div>
          {!loading && rows.length > 0 ? (
            <div className="text-right small">
              <div>
                <strong>{rows.length}</strong> nota{rows.length === 1 ? "" : "s"}
              </div>
              <div className="text-muted">Total {fmtBrl(totalValor)}</div>
            </div>
          ) : null}
        </div>
        <div className="card-body table-responsive p-0">
          <table className="table table-hover table-striped table-sm mb-0">
            <thead>
              <tr>
                <th style={{ minWidth: "130px" }}>Emissão</th>
                <th style={{ minWidth: "130px" }}>Atendimento</th>
                <th style={{ minWidth: "160px" }}>Paciente</th>
                <th style={{ minWidth: "110px" }}>Status</th>
                <th>Nº NFS-e</th>
                <th className="text-right">Valor</th>
                <th style={{ minWidth: "180px" }}>Discriminação</th>
                <th style={{ width: "72px" }} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted py-4">
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
                  <td colSpan={8} className="text-center text-muted py-4">
                    Nenhuma NFS-e encontrada no período
                    {pacienteAplicado.trim().length >= 2
                      ? ` para “${pacienteAplicado.trim()}”`
                      : ""}
                    {status ? ` com status “${rotuloStatus(status)}”` : ""}.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-nowrap small">{fmtDataHora(r.created_at)}</td>
                    <td className="text-nowrap small">
                      #{r.id_agendamento}
                      {r.data_hora_atendimento ? (
                        <>
                          <br />
                          <span className="text-muted">
                            {fmtDataHora(r.data_hora_atendimento)}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>{r.paciente_nome}</td>
                    <td>
                      <span className={`badge ${badgeStatus(r.status)}`}>
                        {rotuloStatus(r.status)}
                      </span>
                      {r.error_message ? (
                        <div className="text-danger small mt-1" title={r.error_message}>
                          {r.error_message.length > 60
                            ? `${r.error_message.slice(0, 57)}…`
                            : r.error_message}
                        </div>
                      ) : null}
                    </td>
                    <td className="text-nowrap">
                      {r.numero_nfse ?? "—"}
                      {r.codigo_verificacao ? (
                        <div className="text-muted small">{r.codigo_verificacao}</div>
                      ) : null}
                    </td>
                    <td className="text-right text-nowrap font-weight-bold">
                      {fmtBrl(r.valor_servicos)}
                    </td>
                    <td className="small text-truncate" style={{ maxWidth: "220px" }} title={r.discriminacao}>
                      {r.discriminacao}
                    </td>
                    <td className="text-center align-middle">
                      {r.url_danfse ? (
                        <a
                          href={r.url_danfse}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-sm btn-outline-primary"
                          title="Abrir DANFSe"
                        >
                          <i className="fas fa-file-pdf" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
