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
  MAX_CARACTERES_MENSAGEM_WHATSAPP_TAXA_AGENDAMENTO,
  MENSAGEM_PADRAO_WHATSAPP_TAXA_AGENDAMENTO,
  mensagemWhatsappTaxaAgendamentoParaExibicao,
  montarMensagemWhatsappTaxaAgendamento,
} from "@/lib/financeiro/taxa-agendamento-whatsapp";
import { urlWhatsAppComTexto, urlWhatsAppPaciente } from "@/lib/whatsapp/paciente";

type LinksPagamento = {
  linkApp: string;
  valor: number;
  paciente: string;
  telefone: string | null;
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
    linkApp: linkAppTaxa(token),
    valor: ag.taxa_pagamento?.valor ?? 0,
    paciente: ag.paciente_nome,
    telefone: ag.paciente_telefone,
  };
}

function ModalLinkPagamento({
  dados,
  mensagemTemplate,
  onFechar,
  onErro,
}: {
  dados: LinksPagamento;
  mensagemTemplate: string;
  onFechar: () => void;
  onErro: (msg: string) => void;
}) {
  const tituloId = useId();
  const [copiado, setCopiado] = useState(false);

  const textoWhatsapp = montarMensagemWhatsappTaxaAgendamento(
    dados.paciente,
    dados.linkApp,
    mensagemTemplate,
  );

  async function copiar() {
    try {
      await navigator.clipboard.writeText(dados.linkApp);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  function abrirWhatsApp() {
    const wa = urlWhatsAppPaciente(dados.telefone);
    if (!wa) {
      onErro("Telefone do paciente inválido para WhatsApp.");
      return;
    }
    window.open(urlWhatsAppComTexto(wa, textoWhatsapp), "_blank", "noopener,noreferrer");
  }

  return (
    <ModalBackdrop onBackdropClick={onFechar}>
      <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={tituloId}>
              Link de pagamento — {dados.paciente}
            </h5>
            <button type="button" className="close" onClick={onFechar} aria-label="Fechar">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="modal-body">
            <p className="text-muted small mb-3">
              Valor: <strong>{fmtMoeda(dados.valor)}</strong>
            </p>

            <div className="form-group mb-3">
              <label className="d-flex justify-content-between align-items-center">
                <span>Página do app (envio no WhatsApp)</span>
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
                  <button type="button" className="btn btn-outline-secondary" onClick={() => void copiar()}>
                    {copiado ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
            </div>

            <div className="border rounded p-3 bg-light small mb-3">
              <div className="text-muted mb-1">Mensagem que será enviada no WhatsApp:</div>
              <pre className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                {textoWhatsapp}
              </pre>
            </div>

            <button
              type="button"
              className="btn btn-success btn-block btn-lg"
              disabled={!dados.telefone}
              onClick={abrirWhatsApp}
            >
              <i className="fab fa-whatsapp mr-2" aria-hidden />
              Enviar no WhatsApp
            </button>
            {!dados.telefone ? (
              <p className="text-warning small mt-2 mb-0">
                Cadastre o telefone do paciente para enviar pelo WhatsApp.
              </p>
            ) : null}
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

function ModalConfigMensagemWhatsapp({
  mensagemRascunho,
  mensagemErro,
  mensagemFeedback,
  mensagemSalvando,
  onChange,
  onFechar,
  onRestaurar,
  onSalvar,
}: {
  mensagemRascunho: string;
  mensagemErro: string | null;
  mensagemFeedback: string | null;
  mensagemSalvando: boolean;
  onChange: (v: string) => void;
  onFechar: () => void;
  onRestaurar: () => void;
  onSalvar: () => void;
}) {
  const tituloId = useId();

  return (
    <ModalBackdrop onBackdropClick={onFechar}>
      <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={tituloId}>
              <i className="fab fa-whatsapp text-success mr-2" aria-hidden />
              Mensagem WhatsApp — taxa de agendamento
            </h5>
            <button type="button" className="close" onClick={onFechar} aria-label="Fechar">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="modal-body">
            <p className="text-muted small">
              Use <code>{"{nome}"}</code> para o nome do paciente e <code>{"{link}"}</code> para o
              link de pagamento da página do app.
            </p>
            <div className="form-group mb-2">
              <label htmlFor="msg-whatsapp-taxa">Texto da mensagem</label>
              <textarea
                id="msg-whatsapp-taxa"
                className="form-control"
                rows={7}
                maxLength={MAX_CARACTERES_MENSAGEM_WHATSAPP_TAXA_AGENDAMENTO}
                value={mensagemRascunho}
                onChange={(e) => onChange(e.target.value)}
              />
              <small className="form-text text-muted">
                {mensagemRascunho.length}/{MAX_CARACTERES_MENSAGEM_WHATSAPP_TAXA_AGENDAMENTO}{" "}
                caracteres
              </small>
            </div>
            <div className="border rounded p-3 bg-light small mb-0">
              <div className="text-muted mb-1">Pré-visualização (exemplo):</div>
              <pre className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                {montarMensagemWhatsappTaxaAgendamento(
                  "Maria Silva",
                  "https://exemplo.com/pagamento/taxa-agendamento/abc",
                  mensagemRascunho,
                )}
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
            <button type="button" className="btn btn-outline-secondary" onClick={onRestaurar}>
              Restaurar padrão
            </button>
            <button type="button" className="btn btn-secondary" onClick={onFechar}>
              Fechar
            </button>
            <button
              type="button"
              className="btn btn-success"
              disabled={mensagemSalvando}
              onClick={onSalvar}
            >
              {mensagemSalvando ? "Salvando…" : "Salvar mensagem"}
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
  pago_em_dinheiro: boolean;
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
  podePersonalizarMensagemWhatsapp = false,
}: {
  nomeEmpresaCurto?: string;
  podePersonalizarMensagemWhatsapp?: boolean;
}) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [lista, setLista] = useState<AgendamentoConfirmacao[]>([]);
  const [taxaPadrao, setTaxaPadrao] = useState(0);
  const [agendamentosConfirmacao, setAgendamentosConfirmacao] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<"pendente" | "confirmado" | "todos">("todos");
  const [dataDe, setDataDe] = useState<string>(hojeLocal);
  const [dataAte, setDataAte] = useState<string>(hojeLocal);
  const [busca, setBusca] = useState("");
  const [filtroPagamento, setFiltroPagamento] = useState<
    "todos" | "pago" | "pendente" | "expirado" | "cancelado" | "sem"
  >("todos");
  const [acaoId, setAcaoId] = useState<number | null>(null);
  const [linksPorAgendamento, setLinksPorAgendamento] = useState<Record<number, LinksPagamento>>(
    {},
  );
  const [modalLinks, setModalLinks] = useState<LinksPagamento | null>(null);
  const [mensagemWhatsapp, setMensagemWhatsapp] = useState("");
  const [modalMensagemWhatsapp, setModalMensagemWhatsapp] = useState(false);
  const [mensagemRascunho, setMensagemRascunho] = useState("");
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [mensagemFeedback, setMensagemFeedback] = useState<string | null>(null);
  const [mensagemSalvando, setMensagemSalvando] = useState(false);

  const mensagemTemplate = useMemo(
    () => mensagemWhatsappTaxaAgendamentoParaExibicao(mensagemWhatsapp),
    [mensagemWhatsapp],
  );

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
        setAgendamentosConfirmacao(json.agendamentos_confirmacao === true);
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
    const interval = setInterval(() => {
      void carregar({ silent: true });
    }, 30_000);
    return () => clearInterval(interval);
  }, [carregar]);

  useEffect(() => {
    let cancelled = false;
    async function loadMensagem() {
      try {
        const res = await fetch("/api/atendimentos/confirmacao/mensagem-whatsapp", {
          credentials: "include",
        });
        const json = (await res.json()) as { mensagem?: string; error?: string };
        if (cancelled || !res.ok) return;
        setMensagemWhatsapp(json.mensagem ?? "");
      } catch {
        /* mantém padrão local */
      }
    }
    void loadMensagem();
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function confirmar(id: number, pagamentoDinheiro = false) {
    setAcaoId(id);
    setErro(null);
    try {
      const res = await fetch(`/api/atendimentos/confirmacao/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pagamentoDinheiro
            ? { pagamento_dinheiro: true, valor: taxaPadrao > 0 ? taxaPadrao : undefined }
            : {},
        ),
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
      const linkApp = json.data?.link_pagamento as string | undefined;
      const token = json.data?.token as string | undefined;
      const valorResp = Number(json.data?.valor ?? valor ?? taxaPadrao);
      const ag = lista.find((a) => a.id === id);
      const links: LinksPagamento = {
        linkApp: linkApp ?? (token ? linkAppTaxa(token) : ""),
        valor: valorResp,
        paciente: ag?.paciente_nome ?? "Paciente",
        telefone: ag?.paciente_telefone ?? null,
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
    if (!links?.linkApp) {
      setErro("Gere o link de pagamento antes de enviar pelo WhatsApp.");
      return;
    }
    const texto = montarMensagemWhatsappTaxaAgendamento(
      ag.paciente_nome,
      links.linkApp,
      mensagemTemplate,
    );
    window.open(urlWhatsAppComTexto(wa, texto), "_blank", "noopener,noreferrer");
  }

  function abrirConfigMensagemWhatsapp() {
    setMensagemRascunho(
      mensagemWhatsapp.trim() || MENSAGEM_PADRAO_WHATSAPP_TAXA_AGENDAMENTO,
    );
    setMensagemErro(null);
    setMensagemFeedback(null);
    setModalMensagemWhatsapp(true);
  }

  function fecharConfigMensagemWhatsapp() {
    setModalMensagemWhatsapp(false);
    setMensagemErro(null);
    setMensagemFeedback(null);
  }

  async function salvarMensagemWhatsapp() {
    setMensagemSalvando(true);
    setMensagemErro(null);
    setMensagemFeedback(null);
    const texto = mensagemRascunho.trim();
    const payload = texto === MENSAGEM_PADRAO_WHATSAPP_TAXA_AGENDAMENTO ? "" : texto;
    try {
      const res = await fetch("/api/atendimentos/confirmacao/mensagem-whatsapp", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: payload }),
      });
      const json = (await res.json()) as { mensagem?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar mensagem.");
      setMensagemWhatsapp(json.mensagem ?? "");
      setMensagemFeedback("Mensagem salva para todos os usuários da empresa.");
    } catch (e) {
      setMensagemErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setMensagemSalvando(false);
    }
  }

  return (
    <div className="card card-outline card-info">
      <div className="card-header d-flex align-items-center flex-wrap">
        <h3 className="card-title mb-0">Agendamentos</h3>
        {podePersonalizarMensagemWhatsapp ? (
          <div className="ml-auto">
            <button
              type="button"
              className="btn btn-sm btn-outline-success"
              onClick={abrirConfigMensagemWhatsapp}
              title="Personalizar mensagem do WhatsApp"
            >
              <i className="fab fa-whatsapp mr-1" aria-hidden />
              Mensagem WhatsApp
            </button>
          </div>
        ) : null}
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

        {agendamentosConfirmacao ? (
          <p className="text-info small px-3 pt-2 mb-0">
            <strong>Confirmação por taxa ativa:</strong> o horário só é confirmado após pagamento
            pelo link ou mediante botão <strong>Confirmar (dinheiro)</strong>.
          </p>
        ) : null}

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
                              {ag.taxa_pagamento.status === "pago" &&
                              ag.taxa_pagamento.pago_em_dinheiro
                                ? " · dinheiro"
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
                              Ver link
                            </button>
                          </div>
                        ) : null}
                      </td>
                      <td className="text-right text-nowrap">
                        {ag.status === "pendente" ? (
                          agendamentosConfirmacao ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success mr-1"
                              disabled={busy || taxaPadrao <= 0}
                              title="Registra taxa em dinheiro e confirma o horário"
                              onClick={() => void confirmar(ag.id, true)}
                            >
                              Confirmar (dinheiro)
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success mr-1"
                              disabled={busy}
                              onClick={() => void confirmar(ag.id)}
                            >
                              Confirmar
                            </button>
                          )
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary mr-1"
                          disabled={busy}
                          title="Gera link de pagamento (página do app)"
                          onClick={() => void gerarLinkPagamento(ag.id, taxaPadrao || undefined)}
                        >
                          Link pagamento
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-success"
                          disabled={busy || !ag.paciente_telefone}
                          title="Abrir WhatsApp com link de pagamento"
                          onClick={() => abrirWhatsApp(ag)}
                        >
                          <i className="fab fa-whatsapp" aria-hidden /> WhatsApp
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
        O paciente recebe o link da <strong>página do app</strong>, que redireciona ao checkout
        seguro do Asaas (Pix, cartão ou boleto). A confirmação do pagamento é feita por consulta
        automática e também por webhook, se configurado no painel do Asaas.
      </div>
      {modalLinks ? (
        <ModalLinkPagamento
          dados={modalLinks}
          mensagemTemplate={mensagemTemplate}
          onFechar={() => setModalLinks(null)}
          onErro={setErro}
        />
      ) : null}
      {modalMensagemWhatsapp ? (
        <ModalConfigMensagemWhatsapp
          mensagemRascunho={mensagemRascunho}
          mensagemErro={mensagemErro}
          mensagemFeedback={mensagemFeedback}
          mensagemSalvando={mensagemSalvando}
          onChange={setMensagemRascunho}
          onFechar={fecharConfigMensagemWhatsapp}
          onRestaurar={() => setMensagemRascunho(MENSAGEM_PADRAO_WHATSAPP_TAXA_AGENDAMENTO)}
          onSalvar={() => void salvarMensagemWhatsapp()}
        />
      ) : null}
    </div>
  );
}
