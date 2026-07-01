"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import {
  montarMensagemWhatsappConfirmacaoHorario,
  urlWhatsAppComTexto,
  urlWhatsAppPaciente,
} from "@/lib/whatsapp/paciente";
import { NovoAgendamentoModal } from "./novo-agendamento-modal";

type LinksPagamento = {
  linkAsaas: string | null;
  linkApp: string;
  valor: number;
  paciente: string;
  paymentLinkId?: string | null;
};

function ModalBackdrop({
  children,
  onBackdropClick,
}: {
  children: ReactNode;
  onBackdropClick: () => void;
}) {
  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block" }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
      <div
        className="modal-backdrop fade show"
        role="presentation"
        onClick={onBackdropClick}
        onKeyDown={(e) => {
          if (e.key === "Escape") onBackdropClick();
        }}
      />
    </>
  );
}

function linkAppTaxa(token: string): string {
  if (typeof window === "undefined") return `/pagamento/taxa-agendamento/${token}`;
  return `${window.location.origin}/pagamento/taxa-agendamento/${token}`;
}

function linksDeAgendamento(
  ag: AgendamentoConfirmacao,
  cache?: LinksPagamento | null,
): LinksPagamento | null {
  if (cache) return cache;
  const token = ag.taxa_pagamento?.token;
  if (!token) return null;
  return {
    linkAsaas: ag.taxa_pagamento?.link_asaas ?? null,
    linkApp: linkAppTaxa(token),
    valor: ag.taxa_pagamento?.valor ?? 0,
    paciente: ag.paciente_nome,
  };
}

function ModalLinksPagamento({
  dados,
  onFechar,
}: {
  dados: LinksPagamento;
  onFechar: () => void;
}) {
  const tituloId = useId();
  const [copiado, setCopiado] = useState<string | null>(null);

  async function copiar(texto: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(rotulo);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setCopiado(null);
    }
  }

  return (
    <ModalBackdrop onBackdropClick={onFechar}>
      <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={tituloId}>
              Links de pagamento — {dados.paciente}
            </h5>
            <button type="button" className="close" onClick={onFechar} aria-label="Fechar">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="modal-body">
            <p className="text-muted small mb-3">
              Valor: <strong>{fmtMoeda(dados.valor)}</strong>
              {dados.paymentLinkId ? (
                <>
                  {" "}
                  · ID Asaas: <code>{dados.paymentLinkId}</code>
                </>
              ) : null}
            </p>

            <div className="form-group">
              <label className="d-flex justify-content-between align-items-center">
                <span>1. Checkout Asaas (Pix / cartão / boleto)</span>
                {dados.linkAsaas ? (
                  <a
                    href={dados.linkAsaas}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-primary"
                  >
                    Abrir
                  </a>
                ) : null}
              </label>
              {dados.linkAsaas ? (
                <div className="input-group input-group-sm">
                  <input
                    type="text"
                    className="form-control font-monospace small"
                    readOnly
                    value={dados.linkAsaas}
                  />
                  <div className="input-group-append">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => void copiar(dados.linkAsaas!, "asaas")}
                    >
                      {copiado === "asaas" ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-warning small mb-0">Link Asaas indisponível.</p>
              )}
            </div>

            <div className="form-group mb-0">
              <label className="d-flex justify-content-between align-items-center">
                <span>2. Página do app (envio no WhatsApp)</span>
                <a
                  href={dados.linkApp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-outline-primary"
                >
                  Abrir
                </a>
              </label>
              <div className="input-group input-group-sm">
                <input
                  type="text"
                  className="form-control font-monospace small"
                  readOnly
                  value={dados.linkApp}
                />
                <div className="input-group-append">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => void copiar(dados.linkApp, "app")}
                  >
                    {copiado === "app" ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
              <p className="text-muted small mt-2 mb-0">
                Use o link 1 para pagar direto no Asaas; o link 2 redireciona o paciente pelo app.
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}

type TaxaPagamento = {
  id: number;
  token: string;
  valor: number;
  status: string;
  expira_em: string | null;
  pago_em: string | null;
  link_asaas: string | null;
};

type AgendamentoConfirmacao = {
  id: number;
  data_hora_inicio: string;
  data_hora_fim: string;
  status: string;
  paciente_nome: string;
  paciente_telefone: string | null;
  profissional_nome: string;
  nome_sala: string;
  observacoes: string | null;
  taxa_pagamento: TaxaPagamento | null;
};

function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const PAGAMENTO_BADGE: Record<string, { cls: string; label: string }> = {
  pago: { cls: "success", label: "Pago" },
  pendente: { cls: "warning", label: "Pendente" },
  expirado: { cls: "secondary", label: "Expirado" },
  cancelado: { cls: "secondary", label: "Cancelado" },
};

export function ConfirmarAtendimentoClient({
  nomeEmpresaCurto,
}: {
  nomeEmpresaCurto: string;
}) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [lista, setLista] = useState<AgendamentoConfirmacao[]>([]);
  const [taxaPadrao, setTaxaPadrao] = useState(0);
  const [filtroStatus, setFiltroStatus] = useState<"pendente" | "confirmado" | "todos">(
    "todos",
  );
  const [dataDe, setDataDe] = useState<string>(hojeLocal);
  const [dataAte, setDataAte] = useState<string>(hojeLocal);
  const [busca, setBusca] = useState("");
  const [filtroPagamento, setFiltroPagamento] = useState<
    "todos" | "pago" | "pendente" | "expirado" | "cancelado" | "sem"
  >("todos");
  const [acaoId, setAcaoId] = useState<number | null>(null);
  const [linksPorAgendamento, setLinksPorAgendamento] = useState<
    Record<number, LinksPagamento>
  >({});
  const [modalLinks, setModalLinks] = useState<LinksPagamento | null>(null);
  const [modalNovoAberto, setModalNovoAberto] = useState(false);

  const carregar = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setCarregando(true);
      setErro(null);
      try {
        const params = new URLSearchParams({
          status: filtroStatus,
          de: dataDe,
          ate: dataAte,
        });
        const res = await fetch(`/api/atendimentos/confirmacao?${params.toString()}`, {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar.");
        setLista((json.data ?? []) as AgendamentoConfirmacao[]);
        setTaxaPadrao(Number(json.taxa_agendamento_padrao ?? 0));
      } catch (e) {
        if (!opts?.silent) setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      } finally {
        if (!opts?.silent) setCarregando(false);
      }
    },
    [filtroStatus, dataDe, dataAte],
  );

  useEffect(() => {
    void carregar();
    // Atualiza o status de pagamento automaticamente (polling no servidor consulta o Asaas).
    const interval = setInterval(() => {
      void carregar({ silent: true });
    }, 30_000);
    return () => clearInterval(interval);
  }, [carregar]);

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista.filter((ag) => {
      if (termo) {
        const alvo = `${ag.paciente_nome} ${ag.paciente_telefone ?? ""} ${ag.profissional_nome}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      if (filtroPagamento !== "todos") {
        if (filtroPagamento === "sem") {
          if (ag.taxa_pagamento) return false;
        } else if ((ag.taxa_pagamento?.status ?? null) !== filtroPagamento) {
          return false;
        }
      }
      return true;
    });
  }, [lista, busca, filtroPagamento]);

  async function confirmar(id: number) {
    setAcaoId(id);
    setErro(null);
    try {
      const res = await fetch(`/api/atendimentos/confirmacao/${id}`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao confirmar.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao confirmar.");
    } finally {
      setAcaoId(null);
    }
  }

  async function gerarLinkPagamento(id: number, valor?: number) {
    setAcaoId(id);
    setErro(null);
    try {
      const res = await fetch(`/api/atendimentos/confirmacao/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(valor != null ? { valor } : {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao gerar link.");
      const linkAsaas = (json.data?.link_pagamento_asaas as string | undefined) ?? null;
      const linkApp = json.data?.link_pagamento as string | undefined;
      const token = json.data?.token as string | undefined;
      const valorResp = Number(json.data?.valor ?? valor ?? taxaPadrao);
      const ag = lista.find((a) => a.id === id);
      const links: LinksPagamento = {
        linkAsaas,
        linkApp: linkApp ?? (token ? linkAppTaxa(token) : ""),
        valor: valorResp,
        paciente: ag?.paciente_nome ?? "Paciente",
        paymentLinkId: (json.data?.payment_link_id as string | undefined) ?? null,
      };
      if (links.linkApp) {
        setLinksPorAgendamento((prev) => ({ ...prev, [id]: links }));
        setModalLinks(links);
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar link.");
    } finally {
      setAcaoId(null);
    }
  }

  function abrirWhatsApp(ag: AgendamentoConfirmacao) {
    const wa = urlWhatsAppPaciente(ag.paciente_telefone);
    if (!wa) {
      setErro("Telefone do paciente inválido para WhatsApp.");
      return;
    }
    const cache = linksPorAgendamento[ag.id];
    const links = linksDeAgendamento(ag, cache);
    const link =
      links?.linkAsaas ?? links?.linkApp ?? null;
    const texto = montarMensagemWhatsappConfirmacaoHorario({
      nomePaciente: ag.paciente_nome,
      nomeEmpresa: nomeEmpresaCurto,
      inicioLocal: ag.data_hora_inicio,
      linkPagamento: link,
    });
    window.open(urlWhatsAppComTexto(wa, texto), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="card card-outline card-info">
      <div className="card-header d-flex align-items-center">
        <h3 className="card-title mb-0">Agendamentos</h3>
        <div className="card-tools ml-auto">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => setModalNovoAberto(true)}
          >
            <i className="fas fa-plus" aria-hidden /> Novo agendamento
          </button>
        </div>
      </div>
      <div className="card-body p-0">
        <div className="border-bottom p-3">
          <div className="form-row align-items-end">
            <div className="col-6 col-md-2 form-group mb-2">
              <label className="small mb-1" htmlFor="filtro-de">
                De
              </label>
              <input
                id="filtro-de"
                type="date"
                className="form-control form-control-sm"
                value={dataDe}
                max={dataAte || undefined}
                onChange={(e) => setDataDe(e.target.value)}
              />
            </div>
            <div className="col-6 col-md-2 form-group mb-2">
              <label className="small mb-1" htmlFor="filtro-ate">
                Até
              </label>
              <input
                id="filtro-ate"
                type="date"
                className="form-control form-control-sm"
                value={dataAte}
                min={dataDe || undefined}
                onChange={(e) => setDataAte(e.target.value)}
              />
            </div>
            <div className="col-6 col-md-2 form-group mb-2">
              <label className="small mb-1" htmlFor="filtro-status">
                Status
              </label>
              <select
                id="filtro-status"
                className="form-control form-control-sm"
                value={filtroStatus}
                onChange={(e) =>
                  setFiltroStatus(e.target.value as "pendente" | "confirmado" | "todos")
                }
              >
                <option value="todos">Todos</option>
                <option value="pendente">Pendentes</option>
                <option value="confirmado">Confirmados</option>
              </select>
            </div>
            <div className="col-6 col-md-2 form-group mb-2">
              <label className="small mb-1" htmlFor="filtro-pagamento">
                Pagamento
              </label>
              <select
                id="filtro-pagamento"
                className="form-control form-control-sm"
                value={filtroPagamento}
                onChange={(e) =>
                  setFiltroPagamento(
                    e.target.value as
                      | "todos"
                      | "pago"
                      | "pendente"
                      | "expirado"
                      | "cancelado"
                      | "sem",
                  )
                }
              >
                <option value="todos">Todos</option>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="expirado">Expirado</option>
                <option value="cancelado">Cancelado</option>
                <option value="sem">Sem link</option>
              </select>
            </div>
            <div className="col-12 col-md-4 form-group mb-2">
              <label className="small mb-1" htmlFor="filtro-busca">
                Buscar
              </label>
              <input
                id="filtro-busca"
                type="search"
                className="form-control form-control-sm"
                placeholder="Paciente, telefone ou profissional"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
        </div>

        {erro ? (
          <div className="alert alert-danger m-3 mb-0" role="alert">
            {erro}
          </div>
        ) : null}

        {taxaPadrao > 0 ? (
          <p className="text-muted small px-3 pt-3 mb-0">
            Taxa padrão de agendamento: <strong>{fmtMoeda(taxaPadrao)}</strong>
          </p>
        ) : (
          <p className="text-warning small px-3 pt-3 mb-0">
            Taxa de agendamento não configurada na empresa. Informe o valor ao gerar o link ou
            configure em Empresas.
          </p>
        )}

        {carregando ? (
          <p className="text-muted p-3">Carregando…</p>
        ) : listaFiltrada.length === 0 ? (
          <p className="text-muted p-3 mb-0">Nenhum agendamento encontrado.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover table-striped mb-0">
              <thead>
                <tr>
                  <th>Data / hora</th>
                  <th>Paciente</th>
                  <th>Profissional</th>
                  <th>Status</th>
                  <th>Pagamento</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((ag) => {
                  const cache = linksPorAgendamento[ag.id];
                  const links = linksDeAgendamento(ag, cache);
                  const busy = acaoId === ag.id;
                  return (
                    <tr key={ag.id}>
                      <td>{fmtDataHora(ag.data_hora_inicio)}</td>
                      <td>
                        {ag.paciente_nome}
                        {ag.paciente_telefone ? (
                          <div className="text-muted small">{ag.paciente_telefone}</div>
                        ) : null}
                      </td>
                      <td>
                        {ag.profissional_nome}
                        <div className="text-muted small">{ag.nome_sala}</div>
                      </td>
                      <td>
                        <span
                          className={`badge badge-${ag.status === "confirmado" ? "success" : "warning"}`}
                        >
                          {ag.status === "confirmado" ? "Confirmado" : "Pendente"}
                        </span>
                      </td>
                      <td>
                        {ag.taxa_pagamento ? (
                          <>
                            <span
                              className={`badge badge-${
                                PAGAMENTO_BADGE[ag.taxa_pagamento.status]?.cls ?? "secondary"
                              }`}
                            >
                              {PAGAMENTO_BADGE[ag.taxa_pagamento.status]?.label ??
                                ag.taxa_pagamento.status}
                            </span>
                            <div className="text-muted small mt-1">
                              {fmtMoeda(ag.taxa_pagamento.valor)}
                              {ag.taxa_pagamento.status === "pago" && ag.taxa_pagamento.pago_em
                                ? ` · pago em ${fmtDataHora(ag.taxa_pagamento.pago_em)}`
                                : null}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted small">Sem link</span>
                        )}
                        {links && ag.taxa_pagamento?.status === "pendente" ? (
                          <div className="small mt-1">
                            <button
                              type="button"
                              className="btn btn-link btn-sm p-0 align-baseline"
                              onClick={() => setModalLinks(links)}
                            >
                              Ver 2 links
                            </button>
                          </div>
                        ) : null}
                      </td>
                      <td className="text-right text-nowrap">
                        {ag.status === "pendente" ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-success mr-1"
                            disabled={busy}
                            onClick={() => void confirmar(ag.id)}
                          >
                            Confirmar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary mr-1"
                          disabled={busy}
                          title="Gera link de pagamento via Asaas"
                          onClick={() => void gerarLinkPagamento(ag.id, taxaPadrao || undefined)}
                        >
                          Link pagamento
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-success"
                          disabled={busy || !ag.paciente_telefone}
                          title="Abrir WhatsApp com mensagem de confirmação"
                          onClick={() => abrirWhatsApp(ag)}
                        >
                          <i className="fab fa-whatsapp" aria-hidden /> Zap
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card-footer text-muted small">
        Pagamento via <strong>Link de Pagamento Asaas</strong> (
        <a
          href="https://docs.asaas.com/docs/creating-a-payment-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          documentação
        </a>
        ). A confirmação do pagamento é feita por consulta automática (polling) e também por webhook,
        se configurado no painel do Asaas.
      </div>
      {modalLinks ? (
        <ModalLinksPagamento dados={modalLinks} onFechar={() => setModalLinks(null)} />
      ) : null}
      {modalNovoAberto ? (
        <NovoAgendamentoModal
          dataPadrao={dataDe}
          onFechar={() => setModalNovoAberto(false)}
          onCriado={() => void carregar({ silent: true })}
        />
      ) : null}
    </div>
  );
}
