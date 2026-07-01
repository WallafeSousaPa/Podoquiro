"use client";

import {
  BotaoDataComFotos,
  ModalFotosRegistro,
  type FotoRegistro,
  type ModalFotosCtx,
} from "@/components/registro-fotos-modal";
import type { ClientesAusentesData } from "@/lib/relatorios/clientes-ausentes";
import {
  MAX_CARACTERES_MENSAGEM_WHATSAPP_CLIENTES_AUSENTES,
  MENSAGEM_PADRAO_WHATSAPP_CLIENTES_AUSENTES,
  mensagemWhatsappClientesAusentesParaExibicao,
  montarMensagemWhatsappClienteAusente,
} from "@/lib/relatorios/clientes-ausentes-whatsapp";
import { normalizeCpfDigits } from "@/lib/pacientes";
import { urlWhatsAppComTexto, urlWhatsAppPaciente } from "@/lib/whatsapp/paciente";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";

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

function fmtCpfExibicao(digits: string | null): string {
  if (!digits) return "—";
  const d = normalizeCpfDigits(digits);
  if (d.length !== 11) return digits;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function badgeAgendamentoStatus(status: string): { label: string; className: string } {
  const s = status.replace(/_/g, " ");
  const map: Record<string, string> = {
    pendente: "badge-warning",
    confirmado: "badge-primary",
    em_andamento: "badge-info",
    realizado: "badge-success",
    cancelado: "badge-secondary",
    faltou: "badge-secondary",
    adiado: "badge-primary",
    curativo_agendado: "badge-primary",
  };
  const cls = map[status] ?? "badge-light";
  return { label: s, className: `badge ${cls}` };
}

type AtendimentoTimelineItem = {
  id: number;
  status: string;
  data_hora_inicio: string;
  data_hora_fim: string;
  profissional_nome: string;
  sala_nome: string;
  procedimentos: { nome: string; valor_aplicado: number }[];
  qtd_fotos: number;
  fotos: FotoRegistro[];
};

type PacienteTimelineCtx = {
  id: number;
  nome: string;
};

function ModalBackdrop({
  children,
  onBackdropClick,
  ariaLabelledBy,
  zIndex = 1050,
}: {
  children: ReactNode;
  onBackdropClick: () => void;
  ariaLabelledBy?: string;
  zIndex?: number;
}) {
  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block", zIndex }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
      >
        {children}
      </div>
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: zIndex - 5 }}
        role="presentation"
        onClick={onBackdropClick}
      />
    </>
  );
}

export function ClientesAusentesClient() {
  const hoje = dataLocalYmd();
  const filtrosId = useId();
  const timelineTitleId = useId();
  const mensagemWhatsappTitleId = useId();

  const [dataReferencia, setDataReferencia] = useState(hoje);
  const [diasMinimos, setDiasMinimos] = useState(30);
  const [ultimoDe, setUltimoDe] = useState("");
  const [ultimoAte, setUltimoAte] = useState("");
  const [somenteAtivos, setSomenteAtivos] = useState(true);
  const [incluirSemAtendimento, setIncluirSemAtendimento] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");

  const [mensagemWhatsapp, setMensagemWhatsapp] = useState("");
  const [mensagemWhatsappExibicao, setMensagemWhatsappExibicao] = useState(
    MENSAGEM_PADRAO_WHATSAPP_CLIENTES_AUSENTES,
  );
  const [modalMensagemWhatsapp, setModalMensagemWhatsapp] = useState(false);
  const [mensagemRascunho, setMensagemRascunho] = useState("");
  const [mensagemSalvando, setMensagemSalvando] = useState(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [mensagemFeedback, setMensagemFeedback] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ClientesAusentesData | null>(null);

  const [timelinePaciente, setTimelinePaciente] = useState<PacienteTimelineCtx | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineItens, setTimelineItens] = useState<AtendimentoTimelineItem[]>([]);
  const [modalFotos, setModalFotos] = useState<ModalFotosCtx | null>(null);

  const carregar = useCallback(async (buscaOverride?: string) => {
    setLoading(true);
    setError(null);
    const buscaParam = (buscaOverride ?? buscaAplicada).trim();
    try {
      const params = new URLSearchParams({
        data_referencia: dataReferencia,
        dias_minimos: String(diasMinimos),
        somente_ativos: somenteAtivos ? "1" : "0",
        incluir_sem_atendimento: incluirSemAtendimento ? "1" : "0",
      });
      if (ultimoDe) params.set("ultimo_atendimento_de", ultimoDe);
      if (ultimoAte) params.set("ultimo_atendimento_ate", ultimoAte);
      if (buscaParam) params.set("busca", buscaParam);

      const res = await fetch(`/api/relatorios/clientes-ausentes?${params}`, {
        credentials: "include",
      });
      const j = (await res.json()) as { data?: ClientesAusentesData; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar relatório.");
      setData(j.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [
    buscaAplicada,
    dataReferencia,
    diasMinimos,
    incluirSemAtendimento,
    somenteAtivos,
    ultimoAte,
    ultimoDe,
  ]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    let cancelled = false;
    async function loadMensagem() {
      try {
        const res = await fetch("/api/relatorios/clientes-ausentes/mensagem-whatsapp", {
          credentials: "include",
        });
        const json = (await res.json()) as {
          mensagem?: string;
          mensagem_exibicao?: string;
          error?: string;
        };
        if (cancelled || !res.ok) return;
        setMensagemWhatsapp(json.mensagem ?? "");
        setMensagemWhatsappExibicao(
          json.mensagem_exibicao ??
            mensagemWhatsappClientesAusentesParaExibicao(json.mensagem),
        );
      } catch {
        /* mantém padrão local */
      }
    }
    void loadMensagem();
    return () => {
      cancelled = true;
    };
  }, []);

  const aplicarPresetDias = (dias: number) => {
    setDiasMinimos(dias);
  };

  const aplicarPresetUltimo = (dias: number) => {
    setUltimoDe(ymdMenosDias(hoje, dias));
    setUltimoAte(hoje);
  };

  const consultar = () => {
    setBuscaAplicada(busca);
    void carregar(busca);
  };

  const abrirConfigMensagemWhatsapp = () => {
    setMensagemRascunho(
      mensagemWhatsapp.trim() || MENSAGEM_PADRAO_WHATSAPP_CLIENTES_AUSENTES,
    );
    setMensagemErro(null);
    setMensagemFeedback(null);
    setModalMensagemWhatsapp(true);
  };

  const fecharConfigMensagemWhatsapp = () => {
    setModalMensagemWhatsapp(false);
    setMensagemErro(null);
    setMensagemFeedback(null);
  };

  async function salvarMensagemWhatsapp() {
    setMensagemSalvando(true);
    setMensagemErro(null);
    setMensagemFeedback(null);
    const texto = mensagemRascunho.trim();
    const payload =
      texto === MENSAGEM_PADRAO_WHATSAPP_CLIENTES_AUSENTES ? "" : texto;
    try {
      const res = await fetch("/api/relatorios/clientes-ausentes/mensagem-whatsapp", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: payload }),
      });
      const json = (await res.json()) as {
        mensagem?: string;
        mensagem_exibicao?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar mensagem.");
      setMensagemWhatsapp(json.mensagem ?? "");
      setMensagemWhatsappExibicao(
        json.mensagem_exibicao ??
          mensagemWhatsappClientesAusentesParaExibicao(json.mensagem),
      );
      setMensagemFeedback("Mensagem salva para todos os usuários da empresa.");
    } catch (e) {
      setMensagemErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setMensagemSalvando(false);
    }
  }

  function abrirWhatsAppPaciente(nome: string, telefone: string | null) {
    const wa = urlWhatsAppPaciente(telefone);
    if (!wa) return;
    const texto = montarMensagemWhatsappClienteAusente(nome, mensagemWhatsappExibicao);
    window.open(urlWhatsAppComTexto(wa, texto), "_blank", "noopener,noreferrer");
  }

  const abrirTimeline = async (id: number, nome: string) => {
    setTimelinePaciente({ id, nome });
    setTimelineLoading(true);
    setTimelineError(null);
    setTimelineItens([]);
    try {
      const res = await fetch(`/api/pacientes/${id}/atendimentos-realizados`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        data?: AtendimentoTimelineItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar atendimentos.");
      const itens = (json.data ?? []).map((row) => ({
        ...row,
        qtd_fotos: row.qtd_fotos ?? row.fotos?.length ?? 0,
        fotos: row.fotos ?? [],
      }));
      setTimelineItens(itens);
    } catch (e) {
      setTimelineError(e instanceof Error ? e.message : "Erro ao carregar atendimentos.");
    } finally {
      setTimelineLoading(false);
    }
  };

  const fecharTimeline = () => {
    setTimelinePaciente(null);
    setTimelineItens([]);
    setTimelineError(null);
    setModalFotos(null);
  };

  const exportarCsv = () => {
    if (!data) return;
    const linhas: string[] = [
      "Relatório de clientes ausentes",
      `Data referência;${fmtDataRef(data.filtros.data_referencia)}`,
      `Dias mínimos de ausência;${data.filtros.dias_minimos}`,
      "",
      "Paciente;CPF;Telefone;Último atendimento;Dias ausente;Profissional último;Total atendimentos;Ativo",
    ];
    for (const p of data.pacientes) {
      linhas.push(
        [
          p.nome,
          fmtCpfExibicao(p.cpf),
          p.telefone ?? "",
          p.ultimo_atendimento ? fmtDataHora(p.ultimo_atendimento) : "Nunca atendido",
          p.dias_ausente != null ? String(p.dias_ausente) : "—",
          p.profissional_ultimo ?? "",
          String(p.total_atendimentos),
          p.ativo ? "Sim" : "Não",
        ].join(";"),
      );
    }
    const blob = new Blob(["\uFEFF" + linhas.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `clientes-ausentes-${data.filtros.data_referencia}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="card card-outline card-primary">
        <div className="card-header d-flex align-items-center flex-wrap">
          <h3 className="card-title mb-0" id={filtrosId}>
            Filtros
          </h3>
          <div className="ml-auto">
            <button
              type="button"
              className="btn btn-sm btn-outline-success"
              onClick={abrirConfigMensagemWhatsapp}
              title="Configurar mensagem do WhatsApp"
            >
              <i className="fab fa-whatsapp mr-1" aria-hidden />
              Mensagem WhatsApp
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="form-row align-items-end">
            <div className="form-group col-sm-6 col-md-3">
              <label htmlFor="ca-data-ref">Data de referência</label>
              <input
                id="ca-data-ref"
                type="date"
                className="form-control"
                value={dataReferencia}
                onChange={(e) => setDataReferencia(e.target.value)}
              />
              <small className="form-text text-muted">Calcula a ausência até esta data.</small>
            </div>
            <div className="form-group col-sm-6 col-md-2">
              <label htmlFor="ca-dias-min">Dias mínimos ausente</label>
              <input
                id="ca-dias-min"
                type="number"
                min={0}
                className="form-control"
                value={diasMinimos}
                onChange={(e) => setDiasMinimos(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="form-group col-sm-6 col-md-3">
              <label htmlFor="ca-busca">Buscar paciente</label>
              <input
                id="ca-busca"
                type="search"
                className="form-control"
                placeholder="Nome, CPF ou telefone"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") consultar();
                }}
              />
            </div>
            <div className="form-group col-sm-6 col-md-4">
              <label className="d-block">Atalhos — dias ausente</label>
              <div className="btn-group btn-group-sm flex-wrap" role="group">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => aplicarPresetDias(7)}
                >
                  7+ dias
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => aplicarPresetDias(15)}
                >
                  15+ dias
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => aplicarPresetDias(30)}
                >
                  30+ dias
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => aplicarPresetDias(60)}
                >
                  60+ dias
                </button>
              </div>
            </div>
          </div>

          <div className="form-row align-items-end">
            <div className="form-group col-sm-6 col-md-3">
              <label htmlFor="ca-ultimo-de">Último atendimento de</label>
              <input
                id="ca-ultimo-de"
                type="date"
                className="form-control"
                value={ultimoDe}
                max={ultimoAte || dataReferencia}
                onChange={(e) => setUltimoDe(e.target.value)}
              />
            </div>
            <div className="form-group col-sm-6 col-md-3">
              <label htmlFor="ca-ultimo-ate">Último atendimento até</label>
              <input
                id="ca-ultimo-ate"
                type="date"
                className="form-control"
                value={ultimoAte}
                min={ultimoDe}
                max={dataReferencia}
                onChange={(e) => setUltimoAte(e.target.value)}
              />
            </div>
            <div className="form-group col-sm-6 col-md-6">
              <label className="d-block">Atalhos — período último atendimento</label>
              <div className="btn-group btn-group-sm flex-wrap" role="group">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setUltimoDe("");
                    setUltimoAte("");
                  }}
                >
                  Limpar
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => aplicarPresetUltimo(30)}
                >
                  Últimos 30 dias
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => aplicarPresetUltimo(90)}
                >
                  Últimos 90 dias
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => aplicarPresetUltimo(180)}
                >
                  Últimos 6 meses
                </button>
              </div>
            </div>
          </div>

          <div className="form-row align-items-center">
            <div className="form-group col-md-4 mb-md-0">
              <div className="custom-control custom-checkbox">
                <input
                  type="checkbox"
                  className="custom-control-input"
                  id="ca-somente-ativos"
                  checked={somenteAtivos}
                  onChange={(e) => setSomenteAtivos(e.target.checked)}
                />
                <label className="custom-control-label" htmlFor="ca-somente-ativos">
                  Somente pacientes ativos
                </label>
              </div>
            </div>
            <div className="form-group col-md-4 mb-md-0">
              <div className="custom-control custom-checkbox">
                <input
                  type="checkbox"
                  className="custom-control-input"
                  id="ca-sem-atendimento"
                  checked={incluirSemAtendimento}
                  onChange={(e) => setIncluirSemAtendimento(e.target.checked)}
                />
                <label className="custom-control-label" htmlFor="ca-sem-atendimento">
                  Incluir nunca atendidos
                </label>
              </div>
            </div>
            <div className="form-group col-md-4 mb-0 text-md-right">
              <button type="button" className="btn btn-primary" onClick={consultar}>
                <i className="fas fa-sync-alt mr-1" aria-hidden /> Consultar
              </button>
              <button
                type="button"
                className="btn btn-outline-success ml-2"
                onClick={exportarCsv}
                disabled={!data || data.pacientes.length === 0}
              >
                <i className="fas fa-file-csv mr-1" aria-hidden /> CSV
              </button>
            </div>
          </div>

          <p className="text-muted small mb-0 mt-2">
            Considera apenas atendimentos com status <strong>realizado</strong>. A ausência é a
            diferença em dias entre a data de referência e o último atendimento concluído.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      {loading ? (
        <div className="text-center text-muted py-5">
          <i className="fas fa-spinner fa-spin mr-2" aria-hidden /> Carregando…
        </div>
      ) : !data ? null : (
        <>
          <div className="row">
            <div className="col-sm-6 col-lg-3">
              <div className="small-box bg-warning">
                <div className="inner">
                  <h3>{data.resumo.total_ausentes}</h3>
                  <p>Clientes ausentes</p>
                </div>
                <div className="icon">
                  <i className="fas fa-user-clock" aria-hidden />
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="small-box bg-info">
                <div className="inner">
                  <h3>{data.resumo.media_dias_ausente}</h3>
                  <p>Média de dias ausente</p>
                </div>
                <div className="icon">
                  <i className="fas fa-calendar-day" aria-hidden />
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="small-box bg-secondary">
                <div className="inner">
                  <h3>{data.resumo.nunca_atendidos}</h3>
                  <p>Nunca atendidos</p>
                </div>
                <div className="icon">
                  <i className="fas fa-user-slash" aria-hidden />
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="small-box bg-light border">
                <div className="inner">
                  <h3>{data.resumo.total_pacientes_considerados}</h3>
                  <p>Pacientes na base</p>
                </div>
                <div className="icon text-muted">
                  <i className="fas fa-users" aria-hidden />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                Pacientes com {data.filtros.dias_minimos}+ dias ausente
                {data.filtros.ultimo_atendimento_de && data.filtros.ultimo_atendimento_ate ? (
                  <span className="text-muted small font-weight-normal ml-2">
                    (último atendimento entre {fmtDataRef(data.filtros.ultimo_atendimento_de)} e{" "}
                    {fmtDataRef(data.filtros.ultimo_atendimento_ate)})
                  </span>
                ) : null}
              </h3>
            </div>
            <div className="card-body p-0">
              {data.pacientes.length === 0 ? (
                <p className="text-muted p-3 mb-0">
                  Nenhum paciente encontrado com os filtros informados.
                </p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-striped table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Paciente</th>
                        <th>CPF</th>
                        <th>Telefone</th>
                        <th>Último atendimento</th>
                        <th className="text-right">Dias ausente</th>
                        <th>Profissional</th>
                        <th className="text-right">Atendimentos</th>
                        <th className="text-center" style={{ width: "4.5rem" }}>
                          WhatsApp
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pacientes.map((p) => (
                        <tr key={p.id_paciente}>
                          <td>
                            <button
                              type="button"
                              className="btn btn-link p-0 font-weight-bold text-left"
                              onClick={() => void abrirTimeline(p.id_paciente, p.nome)}
                              title="Ver timeline de atendimentos"
                            >
                              {p.nome}
                            </button>
                            {!p.ativo ? (
                              <span className="badge badge-secondary ml-1">Inativo</span>
                            ) : null}
                          </td>
                          <td>{fmtCpfExibicao(p.cpf)}</td>
                          <td>{p.telefone?.trim() || "—"}</td>
                          <td>
                            {p.ultimo_atendimento ? fmtDataHora(p.ultimo_atendimento) : (
                              <span className="text-muted">Nunca atendido</span>
                            )}
                          </td>
                          <td className="text-right">
                            {p.dias_ausente != null ? (
                              <span
                                className={`badge ${
                                  p.dias_ausente >= 60
                                    ? "badge-danger"
                                    : p.dias_ausente >= 30
                                      ? "badge-warning"
                                      : "badge-info"
                                }`}
                              >
                                {p.dias_ausente} dias
                              </span>
                            ) : (
                              <span className="badge badge-secondary">—</span>
                            )}
                          </td>
                          <td>{p.profissional_ultimo ?? "—"}</td>
                          <td className="text-right">{p.total_atendimentos}</td>
                          <td className="text-center">
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              disabled={!urlWhatsAppPaciente(p.telefone)}
                              title={
                                urlWhatsAppPaciente(p.telefone)
                                  ? "Abrir WhatsApp com mensagem personalizada"
                                  : "Telefone não cadastrado ou inválido"
                              }
                              onClick={() => abrirWhatsAppPaciente(p.nome, p.telefone)}
                            >
                              <i className="fab fa-whatsapp" aria-hidden />
                              <span className="sr-only">WhatsApp</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {timelinePaciente ? (
        <ModalBackdrop
          onBackdropClick={fecharTimeline}
          ariaLabelledBy={timelineTitleId}
          zIndex={1050}
        >
          <div
            className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"
            role="document"
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id={timelineTitleId}>
                  Atendimentos — {timelinePaciente.nome}
                </h5>
                <button type="button" className="close" onClick={fecharTimeline} aria-label="Fechar">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                {timelineLoading ? (
                  <p className="text-muted mb-0">
                    <span className="spinner-border spinner-border-sm mr-2" aria-hidden />
                    Carregando histórico…
                  </p>
                ) : timelineError ? (
                  <div className="alert alert-warning py-2 mb-0">{timelineError}</div>
                ) : timelineItens.length === 0 ? (
                  <p className="text-muted mb-0">Nenhum agendamento encontrado.</p>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {timelineItens.map((ag, idx) => {
                      const ultimo = idx === timelineItens.length - 1;
                      const st = badgeAgendamentoStatus(ag.status);
                      return (
                        <li
                          key={ag.id}
                          className="position-relative pl-4"
                          style={{
                            paddingBottom: ultimo ? 0 : "1.25rem",
                            borderLeft: "2px solid #dee2e6",
                            marginLeft: "0.4rem",
                          }}
                        >
                          <span
                            className="position-absolute bg-primary border border-white rounded-circle"
                            style={{
                              width: "0.75rem",
                              height: "0.75rem",
                              left: "-0.4rem",
                              top: "0.2rem",
                              boxShadow: "0 0 0 1px #dee2e6",
                            }}
                            aria-hidden
                          />
                          <div className="small">
                            <div className="font-weight-bold text-dark">
                              <BotaoDataComFotos
                                dataFmt={fmtDataHora(ag.data_hora_inicio)}
                                qtdFotos={ag.qtd_fotos}
                                onAbrirFotos={() =>
                                  setModalFotos({
                                    titulo: "Fotos do atendimento",
                                    subtitulo: `${fmtDataHora(ag.data_hora_inicio)} · Ag. #${ag.id} · ${ag.profissional_nome}`,
                                    fotos: ag.fotos,
                                  })
                                }
                              />
                              <span className="text-muted font-weight-normal">
                                {" "}
                                — {fmtDataHora(ag.data_hora_fim)}
                              </span>
                              <span className="text-muted font-weight-normal"> · Ag. #{ag.id}</span>
                              <span className="ml-2 align-middle">
                                <span className={st.className}>{st.label}</span>
                              </span>
                            </div>
                            <div className="text-muted mb-1">
                              <i className="fas fa-user-md mr-1" aria-hidden />
                              {ag.profissional_nome}
                              <span className="mx-1">·</span>
                              <i className="fas fa-door-open mr-1" aria-hidden />
                              {ag.sala_nome}
                            </div>
                            {ag.procedimentos.length > 0 ? (
                              <ul className="mb-0 pl-3">
                                {ag.procedimentos.map((proc, i) => (
                                  <li key={`${ag.id}-p-${i}`}>{proc.nome}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={fecharTimeline}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {modalFotos ? (
        <ModalFotosRegistro
          ctx={modalFotos}
          onClose={() => setModalFotos(null)}
          zIndex={1090}
        />
      ) : null}

      {modalMensagemWhatsapp ? (
        <ModalBackdrop
          onBackdropClick={fecharConfigMensagemWhatsapp}
          ariaLabelledBy={mensagemWhatsappTitleId}
          zIndex={1055}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id={mensagemWhatsappTitleId}>
                  <i className="fab fa-whatsapp text-success mr-2" aria-hidden />
                  Mensagem personalizada — WhatsApp
                </h5>
                <button
                  type="button"
                  className="close"
                  onClick={fecharConfigMensagemWhatsapp}
                  aria-label="Fechar"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="text-muted small">
                  A mensagem enviada terá o formato:{" "}
                  <strong>Olá, [nome do paciente]!</strong> seguido do texto abaixo. Use{" "}
                  <code>{"{nome}"}</code> no corpo para repetir o nome, se quiser.
                </p>
                <div className="form-group mb-2">
                  <label htmlFor="ca-msg-whatsapp">Texto personalizado</label>
                  <textarea
                    id="ca-msg-whatsapp"
                    className="form-control"
                    rows={6}
                    maxLength={MAX_CARACTERES_MENSAGEM_WHATSAPP_CLIENTES_AUSENTES}
                    value={mensagemRascunho}
                    onChange={(e) => setMensagemRascunho(e.target.value)}
                  />
                  <small className="form-text text-muted">
                    {mensagemRascunho.length}/{MAX_CARACTERES_MENSAGEM_WHATSAPP_CLIENTES_AUSENTES}{" "}
                    caracteres
                  </small>
                </div>
                <div className="border rounded p-3 bg-light small mb-0">
                  <div className="text-muted mb-1">Pré-visualização (exemplo):</div>
                  <pre className="mb-0 whitespace-pre-wrap" style={{ whiteSpace: "pre-wrap" }}>
                    {montarMensagemWhatsappClienteAusente("Maria Silva", mensagemRascunho)}
                  </pre>
                </div>
                {mensagemErro ? (
                  <div className="alert alert-danger py-2 mt-3 mb-0">{mensagemErro}</div>
                ) : null}
                {mensagemFeedback ? (
                  <div className="alert alert-success py-2 mt-3 mb-0">{mensagemFeedback}</div>
                ) : null}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() =>
                    setMensagemRascunho(MENSAGEM_PADRAO_WHATSAPP_CLIENTES_AUSENTES)
                  }
                >
                  Restaurar padrão
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={fecharConfigMensagemWhatsapp}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  disabled={mensagemSalvando}
                  onClick={() => void salvarMensagemWhatsapp()}
                >
                  {mensagemSalvando ? (
                    <>
                      <span className="spinner-border spinner-border-sm mr-1" aria-hidden />
                      Salvando…
                    </>
                  ) : (
                    <>
                      <i className="fas fa-save mr-1" aria-hidden /> Salvar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </>
  );
}
