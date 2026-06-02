"use client";

import { limitesSemanaInclusive } from "@/lib/agenda/datas-agenda";
import { useCallback, useEffect, useState } from "react";
import { ModalEmissaoNfce } from "./modal-emissao-nfce";

export type NfceEmissaoRow = {
  id: string;
  ambiente: number;
  serie: number | null;
  numero_nf: number | null;
  modelo: number | null;
  status: string;
  chave_acesso: string | null;
  protocolo_autorizacao: string | null;
  c_stat: string | null;
  x_motivo: string | null;
  escopo_emissao: string | null;
  payload_rascunho: Record<string, unknown> | null;
  created_at: string;
};

const STATUS_OPCOES: { value: string; label: string }[] = [
  { value: "", label: "Todos os status" },
  { value: "autorizada", label: "Autorizada" },
  { value: "rejeitada", label: "Rejeitada" },
  { value: "transmitida", label: "Transmitida" },
  { value: "denegada", label: "Denegada" },
  { value: "cancelada", label: "Cancelada" },
  { value: "rascunho", label: "Rascunho" },
];

const ESCOPO_OPCOES: { value: string; label: string }[] = [
  { value: "", label: "Notas + testes" },
  { value: "produto", label: "Somente notas de produto" },
  { value: "teste", label: "Somente testes" },
];

function dataLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  if (status === "autorizada") return "badge-success";
  if (status === "rejeitada" || status === "denegada") return "badge-danger";
  if (status === "cancelada") return "badge-secondary";
  return "badge-warning";
}

function rotuloStatus(status: string) {
  const opt = STATUS_OPCOES.find((s) => s.value === status);
  return opt && opt.value ? opt.label : status.replace(/_/g, " ");
}

type TesteSefaz = {
  ok: boolean;
  httpStatus?: number;
  cStat?: string | null;
  xMotivo?: string | null;
  mensagem?: string;
  error?: string;
};

export function NfceClient() {
  const hoje = dataLocalYmd();
  const semanaPadrao = limitesSemanaInclusive(hoje);

  const [dataInicio, setDataInicio] = useState(semanaPadrao.inicio);
  const [dataFim, setDataFim] = useState(semanaPadrao.fim);
  const [status, setStatus] = useState("");
  const [escopo, setEscopo] = useState("");
  const [rows, setRows] = useState<NfceEmissaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalEmissao, setModalEmissao] = useState(false);

  const [testando, setTestando] = useState(false);
  const [testeResultado, setTesteResultado] = useState<TesteSefaz | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        data_inicio: dataInicio,
        data_fim: dataFim,
      });
      if (status) qs.set("status", status);
      if (escopo) qs.set("escopo", escopo);

      const res = await fetch(`/api/nfe/consultar?${qs.toString()}`, {
        credentials: "include",
      });
      const j = (await res.json()) as { rows?: NfceEmissaoRow[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar notas.");
      setRows(j.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, status, escopo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const aplicarSemanaAtual = () => {
    const { inicio, fim } = limitesSemanaInclusive(hoje);
    setDataInicio(inicio);
    setDataFim(fim);
  };

  const testarSefaz = useCallback(async () => {
    setTestando(true);
    setTesteResultado(null);
    try {
      const res = await fetch("/api/nfe/teste", {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json()) as TesteSefaz;
      setTesteResultado(j);
    } catch (e) {
      setTesteResultado({
        ok: false,
        error: e instanceof Error ? e.message : "Falha ao comunicar com a SEFAZ.",
      });
    } finally {
      setTestando(false);
      void carregar();
    }
  }, [carregar]);

  return (
    <>
      <div className="card card-outline card-info mb-3">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center">
          <div>
            <h3 className="card-title mb-0">
              <i className="fas fa-satellite-dish mr-1" aria-hidden />
              Comunicação com a SEFAZ
            </h3>
            <p className="text-muted small mb-0 mt-1">
              Consulta o status do serviço (consStatServ) diretamente na SEFAZ
              usando o certificado da empresa.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-info"
            disabled={testando}
            onClick={() => void testarSefaz()}
          >
            {testando ? (
              <>
                <span
                  className="spinner-border spinner-border-sm mr-2 align-middle"
                  role="status"
                  aria-hidden
                />
                Testando…
              </>
            ) : (
              <>
                <i className="fas fa-plug mr-1" aria-hidden />
                Testar comunicação
              </>
            )}
          </button>
        </div>
        {testeResultado ? (
          <div className="card-body py-2">
            {testeResultado.ok ? (
              <div className="alert alert-success mb-0" role="alert">
                <i className="fas fa-check-circle mr-1" aria-hidden />
                {testeResultado.mensagem ??
                  "SEFAZ respondeu: serviço disponível."}
                {testeResultado.cStat ? (
                  <span className="ml-2 small text-muted">
                    (cStat {testeResultado.cStat})
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="alert alert-danger mb-0" role="alert">
                <i className="fas fa-exclamation-triangle mr-1" aria-hidden />
                {testeResultado.error ??
                  testeResultado.mensagem ??
                  "A SEFAZ não confirmou disponibilidade do serviço."}
                {testeResultado.cStat ? (
                  <span className="ml-2 small">
                    cStat {testeResultado.cStat}
                    {testeResultado.httpStatus
                      ? ` · HTTP ${testeResultado.httpStatus}`
                      : ""}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="d-flex flex-wrap justify-content-end mb-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setModalEmissao(true)}
        >
          <i className="fas fa-file-invoice mr-1" aria-hidden />
          Emitir nota de produto
        </button>
      </div>

      <div className="card card-outline card-primary mb-3">
        <div className="card-header">
          <h3 className="card-title mb-0">Filtros</h3>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-12 col-md-6 col-lg-3">
              <div className="form-group mb-md-0">
                <label htmlFor="nfce-inicio">Data início</label>
                <input
                  id="nfce-inicio"
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
                <label htmlFor="nfce-fim">Data fim</label>
                <input
                  id="nfce-fim"
                  type="date"
                  className="form-control"
                  value={dataFim}
                  min={dataInicio}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
            </div>
            <div className="col-12 col-md-6 col-lg-3">
              <div className="form-group mb-md-0">
                <label htmlFor="nfce-status">Status</label>
                <select
                  id="nfce-status"
                  className="form-control"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {STATUS_OPCOES.map((s) => (
                    <option key={s.value || "todos"} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="col-12 col-md-6 col-lg-3">
              <div className="form-group mb-md-0">
                <label htmlFor="nfce-escopo">Tipo</label>
                <select
                  id="nfce-escopo"
                  className="form-control"
                  value={escopo}
                  onChange={(e) => setEscopo(e.target.value)}
                >
                  {ESCOPO_OPCOES.map((s) => (
                    <option key={s.value || "todos"} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
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
            <h3 className="card-title mb-0">Notas de produto emitidas</h3>
            <p className="text-muted small mb-0 mt-1">
              Registros enviados diretamente à SEFAZ (NF-e modelo 55 de
              mercadoria) e testes de comunicação no período.
            </p>
          </div>
          {!loading && rows.length > 0 ? (
            <div className="text-right small">
              <strong>{rows.length}</strong> registro
              {rows.length === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
        <div className="card-body table-responsive p-0">
          <table className="table table-hover table-striped table-sm mb-0">
            <thead>
              <tr>
                <th style={{ minWidth: "130px" }}>Emissão</th>
                <th>Tipo</th>
                <th style={{ minWidth: "90px" }}>Nº / Série</th>
                <th style={{ minWidth: "110px" }}>Status</th>
                <th style={{ minWidth: "180px" }}>Chave de acesso</th>
                <th style={{ minWidth: "200px" }}>Retorno SEFAZ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
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
                  <td colSpan={6} className="text-center text-muted py-4">
                    Nenhum registro no período selecionado.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-nowrap small">
                      {fmtDataHora(r.created_at)}
                      <div className="text-muted">
                        {r.ambiente === 1 ? "Produção" : "Homologação"}
                      </div>
                    </td>
                    <td className="small">
                      {r.escopo_emissao === "teste" ? (
                        <span className="badge badge-info">Teste</span>
                      ) : (
                        <span className="badge badge-primary">Produto</span>
                      )}
                    </td>
                    <td className="text-nowrap small">
                      {r.numero_nf ?? "—"}
                      {r.serie != null ? (
                        <span className="text-muted"> / {r.serie}</span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`badge ${badgeStatus(r.status)}`}>
                        {rotuloStatus(r.status)}
                      </span>
                    </td>
                    <td
                      className="small text-monospace text-break"
                      style={{ maxWidth: "220px", wordBreak: "break-all" }}
                    >
                      {r.chave_acesso ?? "—"}
                      {r.protocolo_autorizacao ? (
                        <div className="text-muted">
                          Protocolo {r.protocolo_autorizacao}
                        </div>
                      ) : null}
                    </td>
                    <td className="small">
                      {r.c_stat ? (
                        <span className="text-muted">cStat {r.c_stat} · </span>
                      ) : null}
                      <span title={r.x_motivo ?? undefined}>
                        {r.x_motivo
                          ? r.x_motivo.length > 80
                            ? `${r.x_motivo.slice(0, 77)}…`
                            : r.x_motivo
                          : "—"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ModalEmissaoNfce
        aberto={modalEmissao}
        onFechar={() => setModalEmissao(false)}
        onEmitido={() => void carregar()}
      />
    </>
  );
}
