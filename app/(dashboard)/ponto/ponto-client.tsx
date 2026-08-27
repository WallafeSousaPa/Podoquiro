"use client";

import type { ConsultaPontoData, MarcacaoPonto } from "@/lib/ponto/consultar-registros";
import { formatarHorasTrabalhadas } from "@/lib/ponto/horas-trabalhadas";
import { useCallback, useEffect, useId, useState } from "react";
import {
  ModalAjustarPonto,
  type AjustePontoInicial,
} from "./modal-ajustar-ponto";
import "./ponto.css";

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

function fmtDataRef(ymd: string) {
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
  } catch {
    return ymd;
  }
}

function fmtHora(iso: string, comSegundos = false) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      ...(comSegundos ? { second: "2-digit" as const } : {}),
    });
  } catch {
    return iso;
  }
}

function fmtCpf(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 11) return digits || "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function rotuloTipoBatida(tipo: string) {
  if (tipo === "INCLUIDO_MANUAL") return "Inclusão";
  if (tipo === "ORIGINAL") return "Original";
  return tipo.replace(/_/g, " ");
}

function rotuloOrigem(m: MarcacaoPonto) {
  if (m.desconsiderada) return "Desconsiderada";
  if (m.origem === "INCLUSAO") return "Inclusão";
  if (m.origem === "CORRECAO_HORARIO") return "Horário corrigido";
  return rotuloTipoBatida(m.tipo_batida);
}

function classeMarcacao(m: MarcacaoPonto) {
  if (m.desconsiderada) return "badge badge-secondary ponto-marcacao-desconsiderada";
  if (m.origem === "INCLUSAO") return "badge badge-warning";
  if (m.origem === "CORRECAO_HORARIO") return "badge badge-info";
  return "badge badge-primary";
}

function tituloMarcacao(m: MarcacaoPonto) {
  const partes = [rotuloOrigem(m)];
  if (m.data_hora_original && m.origem === "CORRECAO_HORARIO") {
    partes.push(`original ${fmtHora(m.data_hora_original, true)}`);
  }
  if (m.tratamento?.motivo) partes.push(m.tratamento.motivo);
  if (m.tratamento?.responsavel) partes.push(`por ${m.tratamento.responsavel}`);
  if (m.metodo_validacao) partes.push(rotuloMetodo(m.metodo_validacao));
  if (m.score_precisao != null) partes.push(`score ${m.score_precisao}`);
  if (m.dispositivo_id) partes.push(m.dispositivo_id);
  if (m.nsr != null) partes.push(`NSR ${m.nsr}`);
  return partes.join(" · ");
}

function rotuloMetodo(metodo: string) {
  if (metodo === "BIOMETRIA") return "Biometria";
  return metodo.replace(/_/g, " ");
}

export function PontoClient() {
  const hoje = dataLocalYmd();
  const filtrosId = useId();

  const [dataInicio, setDataInicio] = useState(() => ymdMenosDias(hoje, 7));
  const [dataFim, setDataFim] = useState(hoje);
  const [funcionario, setFuncionario] = useState("");
  const [funcionarioAplicado, setFuncionarioAplicado] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ConsultaPontoData | null>(null);
  const [ajuste, setAjuste] = useState<AjustePontoInicial | null>(null);
  const [modalAjusteAberto, setModalAjusteAberto] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        data_inicio: dataInicio,
        data_fim: dataFim,
      });
      const termo = funcionarioAplicado.trim();
      if (termo.length >= 2) qs.set("funcionario", termo);

      const res = await fetch(`/api/ponto/registros?${qs.toString()}`, {
        credentials: "include",
      });
      const j = (await res.json()) as {
        data?: ConsultaPontoData;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao consultar o ponto.");
      setData(j.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao consultar.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, funcionarioAplicado]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const buscar = () => {
    const termo = funcionario.trim();
    if (termo.length > 0 && termo.length < 2) {
      setError("Informe ao menos 2 caracteres no nome do funcionário.");
      return;
    }
    if (termo === funcionarioAplicado) {
      void carregar();
      return;
    }
    setFuncionarioAplicado(termo);
  };

  const aplicarHoje = () => {
    setDataInicio(hoje);
    setDataFim(hoje);
    setFuncionarioAplicado(funcionario.trim());
  };

  const aplicarPreset = (dias: number) => {
    setDataInicio(ymdMenosDias(hoje, dias));
    setDataFim(hoje);
    setFuncionarioAplicado(funcionario.trim());
  };

  const abrirAjuste = (inicial: AjustePontoInicial | null) => {
    setAjuste(inicial);
    setModalAjusteAberto(true);
  };

  const fecharAjuste = () => {
    setModalAjusteAberto(false);
    setAjuste(null);
  };

  const linhas =
    data?.funcionarios.flatMap((f) =>
      f.dias.map((dia) => ({ funcionario: f, dia })),
    ) ?? [];

  return (
    <div className="ponto-page">
      <p className="text-muted mb-3">
        Consulta das marcações de ponto dos funcionários no período
        selecionado. Ajustes (inclusão, correção ou desconsideração) não
        alteram o registro original.
      </p>

      <div className="card card-outline card-primary mb-3">
        <div className="card-header">
          <h2 className="card-title h5 mb-0" id={filtrosId}>
            Filtros
          </h2>
        </div>
        <div className="card-body ponto-filtros">
          <div className="row">
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="form-group">
                <label htmlFor="ponto-consulta-inicio">Data início</label>
                <input
                  id="ponto-consulta-inicio"
                  type="date"
                  className="form-control"
                  value={dataInicio}
                  max={dataFim}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="form-group">
                <label htmlFor="ponto-consulta-fim">Data fim</label>
                <input
                  id="ponto-consulta-fim"
                  type="date"
                  className="form-control"
                  value={dataFim}
                  min={dataInicio}
                  max={hoje}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
            </div>
            <div className="col-12 col-lg-4">
              <div className="form-group">
                <label htmlFor="ponto-consulta-funcionario">Funcionário</label>
                <input
                  id="ponto-consulta-funcionario"
                  type="search"
                  className="form-control"
                  placeholder="Opcional — mín. 2 caracteres"
                  value={funcionario}
                  onChange={(e) => setFuncionario(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      buscar();
                    }
                  }}
                />
              </div>
            </div>
            <div className="col-12 col-lg-2 d-flex align-items-end">
              <button
                type="button"
                className="btn btn-primary ponto-consultar-btn mb-3 mb-lg-0"
                disabled={loading}
                onClick={buscar}
              >
                {loading ? "…" : "Consultar"}
              </button>
            </div>
          </div>
          <div className="ponto-presets">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={aplicarHoje}
            >
              Hoje
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => aplicarPreset(7)}
            >
              7 dias
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => aplicarPreset(30)}
            >
              30 dias
            </button>
            <span className="small text-muted">
              Marcações de {fmtDataRef(dataInicio)} a {fmtDataRef(dataFim)}
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {data && !loading ? (
        <div className="row ponto-kpi mb-3">
          <div className="col-6 col-lg-3 mb-3 mb-lg-0">
            <div className="info-box">
              <span className="info-box-icon bg-primary">
                <i className="fas fa-users" aria-hidden />
              </span>
              <div className="info-box-content">
                <span className="info-box-text">Funcionários</span>
                <span className="info-box-number">
                  {data.resumo.funcionarios}
                </span>
              </div>
            </div>
          </div>
          <div className="col-6 col-lg-3 mb-3 mb-lg-0">
            <div className="info-box">
              <span className="info-box-icon bg-success">
                <i className="fas fa-fingerprint" aria-hidden />
              </span>
              <div className="info-box-content">
                <span className="info-box-text">Marcações</span>
                <span className="info-box-number">{data.resumo.marcacoes}</span>
              </div>
            </div>
          </div>
          <div className="col-6 col-lg-3 mb-3 mb-lg-0">
            <div className="info-box">
              <span className="info-box-icon bg-info">
                <i className="fas fa-calendar-day" aria-hidden />
              </span>
              <div className="info-box-content">
                <span className="info-box-text">Dias com ponto</span>
                <span className="info-box-number">
                  {data.resumo.dias_com_ponto}
                </span>
              </div>
            </div>
          </div>
          <div className="col-6 col-lg-3 mb-3 mb-lg-0">
            <div className="info-box">
              <span className="info-box-icon bg-warning">
                <i className="fas fa-clock" aria-hidden />
              </span>
              <div className="info-box-content">
                <span className="info-box-text">Horas trabalhadas</span>
                <span className="info-box-number">
                  {formatarHorasTrabalhadas(data.resumo.horas_trabalhadas_minutos)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-header ponto-lista-header d-flex flex-wrap justify-content-between align-items-center">
          <h3 className="card-title mb-0">Funcionários que bateram ponto</h3>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            disabled={loading}
            onClick={() => abrirAjuste(null)}
          >
            <i className="fas fa-edit mr-1" aria-hidden />
            Ajustar ponto
          </button>
        </div>

        <div className="card-body p-0 table-responsive ponto-lista-desktop">
          <table className="table table-hover table-striped table-sm mb-0">
            <thead>
              <tr>
                <th>Funcionário</th>
                <th>Empresa</th>
                <th>CPF</th>
                <th>Cargo</th>
                <th>Data</th>
                <th>Marcações</th>
                <th className="text-right">Horas</th>
                <th className="text-right">Qtd</th>
                <th />
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
              ) : linhas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-muted py-4">
                    Nenhum funcionário bateu ponto no período
                    {funcionarioAplicado.trim().length >= 2
                      ? ` para “${funcionarioAplicado.trim()}”`
                      : ""}
                    .
                  </td>
                </tr>
              ) : (
                linhas.map(({ funcionario: f, dia }) => (
                  <tr key={`${f.funcionario_id}-${dia.data}`}>
                    <td>
                      {f.nome}
                      {!f.ativo ? (
                        <span className="badge badge-secondary ml-2">
                          Inativo
                        </span>
                      ) : null}
                    </td>
                    <td>{f.empresa || "—"}</td>
                    <td className="text-nowrap">{fmtCpf(f.cpf)}</td>
                    <td>{f.cargo || "—"}</td>
                    <td className="text-nowrap">{fmtDataRef(dia.data)}</td>
                    <td>
                      <div className="d-flex flex-wrap ponto-card-marcacoes">
                        {dia.marcacoes.map((m) => (
                          <button
                            key={`${m.nsr ?? "inc"}-${m.id ?? m.tratamento?.id}-${m.data_hora_fato}`}
                            type="button"
                            className={`${classeMarcacao(m)} ponto-marcacao-btn`}
                            title={tituloMarcacao(m)}
                            onClick={() =>
                              abrirAjuste({
                                funcionarioId: f.funcionario_id,
                                dataYmd: dia.data,
                                nsr: m.nsr,
                                tipo: m.desconsiderada
                                  ? undefined
                                  : m.nsr != null
                                    ? "CORRECAO_HORARIO"
                                    : "INCLUSAO",
                              })
                            }
                          >
                            {fmtHora(m.data_hora_fato)}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="text-right text-nowrap">
                      {dia.marcacoes.some((m) => !m.desconsiderada) ? (
                        <>
                          {formatarHorasTrabalhadas(dia.horas_trabalhadas_minutos)}
                          {dia.em_aberto ? (
                            <div className="small text-muted">em aberto</div>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-right">
                      {dia.marcacoes.filter((m) => !m.desconsiderada).length}
                    </td>
                    <td className="text-right text-nowrap">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() =>
                          abrirAjuste({
                            funcionarioId: f.funcionario_id,
                            dataYmd: dia.data,
                          })
                        }
                      >
                        Ajustar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="ponto-lista-mobile">
          {loading ? (
            <p className="text-center text-muted py-4 mb-0">
              <span
                className="spinner-border spinner-border-sm mr-2 align-middle"
                role="status"
                aria-hidden
              />
              Carregando…
            </p>
          ) : linhas.length === 0 ? (
            <p className="text-center text-muted py-4 px-3 mb-0">
              Nenhum funcionário bateu ponto no período
              {funcionarioAplicado.trim().length >= 2
                ? ` para “${funcionarioAplicado.trim()}”`
                : ""}
              .
            </p>
          ) : (
            linhas.map(({ funcionario: f, dia }) => {
              const qtd = dia.marcacoes.filter((m) => !m.desconsiderada).length;
              const temHoras = qtd > 0;
              return (
                <article
                  key={`${f.funcionario_id}-${dia.data}`}
                  className="ponto-card-item"
                >
                  <div className="ponto-card-top">
                    <div className="ponto-card-nome">
                      {f.nome}
                      {!f.ativo ? (
                        <span className="badge badge-secondary ml-2">
                          Inativo
                        </span>
                      ) : null}
                    </div>
                    <div className="ponto-card-horas">
                      {temHoras
                        ? formatarHorasTrabalhadas(dia.horas_trabalhadas_minutos)
                        : "—"}
                      {temHoras && dia.em_aberto ? (
                        <div className="small font-weight-normal text-muted">
                          em aberto
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="ponto-card-meta">
                    {fmtDataRef(dia.data)}
                    {f.empresa ? ` · ${f.empresa}` : ""}
                    {f.cargo ? ` · ${f.cargo}` : ""}
                    {f.cpf ? ` · ${fmtCpf(f.cpf)}` : ""}
                  </div>
                  <div className="ponto-card-marcacoes">
                    {dia.marcacoes.map((m) => (
                      <button
                        key={`${m.nsr ?? "inc"}-${m.id ?? m.tratamento?.id}-${m.data_hora_fato}`}
                        type="button"
                        className={`${classeMarcacao(m)} ponto-marcacao-btn`}
                        title={tituloMarcacao(m)}
                        onClick={() =>
                          abrirAjuste({
                            funcionarioId: f.funcionario_id,
                            dataYmd: dia.data,
                            nsr: m.nsr,
                            tipo: m.desconsiderada
                              ? undefined
                              : m.nsr != null
                                ? "CORRECAO_HORARIO"
                                : "INCLUSAO",
                          })
                        }
                      >
                        {fmtHora(m.data_hora_fato)}
                      </button>
                    ))}
                  </div>
                  <div className="ponto-card-acoes">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() =>
                        abrirAjuste({
                          funcionarioId: f.funcionario_id,
                          dataYmd: dia.data,
                        })
                      }
                    >
                      Ajustar ponto
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="card-footer small text-muted ponto-legenda">
          <span className="badge badge-primary">Original</span>
          <span className="badge badge-info">Corrigida</span>
          <span className="badge badge-warning">Inclusão</span>
          <span className="badge badge-secondary ponto-marcacao-desconsiderada">
            Desconsiderada
          </span>
          <span>
            Horas = pares de batida (entrada/saída). Batida ímpar no dia
            atual conta até agora.
          </span>
        </div>
      </div>

      {modalAjusteAberto ? (
        <ModalAjustarPonto
          key={`${ajuste?.funcionarioId ?? "n"}-${ajuste?.nsr ?? "s"}-${ajuste?.tipo ?? "t"}-${ajuste?.dataYmd ?? ""}`}
          funcionarios={data?.funcionarios_opcoes ?? []}
          funcionariosConsulta={data?.funcionarios ?? []}
          inicial={ajuste}
          onClose={fecharAjuste}
          onSalvo={() => {
            fecharAjuste();
            void carregar();
          }}
        />
      ) : null}
    </div>
  );
}
