"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";
import {
  montarMensagemWhatsappConfirmacaoHorario,
  urlWhatsAppComTexto,
  urlWhatsAppPaciente,
} from "@/lib/whatsapp/paciente";

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
    "pendente",
  );
  const [acaoId, setAcaoId] = useState<number | null>(null);
  const [linksPorAgendamento, setLinksPorAgendamento] = useState<
    Record<number, LinksPagamento>
  >({});
  const [modalLinks, setModalLinks] = useState<LinksPagamento | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(
        `/api/atendimentos/confirmacao?status=${filtroStatus}&dias=45`,
        { credentials: "include" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar.");
      setLista((json.data ?? []) as AgendamentoConfirmacao[]);
      setTaxaPadrao(Number(json.taxa_agendamento_padrao ?? 0));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

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
      <div className="card-header">
        <h3 className="card-title">Confirmar agendamentos</h3>
        <div className="card-tools">
          <select
            className="form-control form-control-sm"
            value={filtroStatus}
            onChange={(e) =>
              setFiltroStatus(e.target.value as "pendente" | "confirmado" | "todos")
            }
            aria-label="Filtrar por status"
          >
            <option value="pendente">Pendentes</option>
            <option value="confirmado">Confirmados</option>
            <option value="todos">Pendentes e confirmados</option>
          </select>
        </div>
      </div>
      <div className="card-body p-0">
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
        ) : lista.length === 0 ? (
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
                {lista.map((ag) => {
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
                          <span className="small">
                            {fmtMoeda(ag.taxa_pagamento.valor)} — {ag.taxa_pagamento.status}
                          </span>
                        ) : (
                          <span className="text-muted small">Sem link</span>
                        )}
                        {links ? (
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
    </div>
  );
}
