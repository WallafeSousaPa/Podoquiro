"use client";

import type { NotaFiscalAtendimentoRow } from "@/lib/financeiro/nota-fiscal-atendimentos-rows";
import {
  bloqueiaReemissaoFocusNfse,
  cpfValidoParaTomadorNfse,
  mensagemErroFocusNfse,
  mensagemErroFocusNfseOuFallback,
  podeCancelarFocusNfse,
  statusInternoDeFocus,
} from "@/lib/focusnfe";
import { useCallback, useEffect, useState, type ReactNode } from "react";

type NfseEmissao = {
  id: string;
  focus_ref: string;
  status: string;
  numero_nfse: string | null;
  codigo_verificacao: string | null;
  numero_rps: string | null;
  serie_rps: string | null;
  url_danfse: string | null;
  error_message: string | null;
  valor_servicos?: number;
  discriminacao?: string;
};

type DetalheResponse = {
  agendamento: {
    id: number;
    data_hora_inicio: string;
    valor_total: number;
    profissional_nome: string;
    nome_sala: string;
    observacoes: string | null;
    procedimentos: { procedimento: string | null; valor_aplicado: number }[];
    pagamentos: {
      valor_pago: number;
      forma: string | null;
      maquineta: string | null;
    }[];
  };
  paciente: {
    id: number;
    nome: string;
    cpf: string | null;
    email: string | null;
    telefone: string | null;
    cep: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
  } | null;
  nfse: NfseEmissao | null;
};

type ConsultarRes = {
  emissao?: NfseEmissao;
  focus?: {
    status?: string;
    mensagem?: string;
    erros?: { codigo?: string; mensagem?: string; correcao?: string }[];
  };
  error?: string;
};

type FaseModal = "detalhe" | "processando" | "resultado";

type Props = {
  row: NotaFiscalAtendimentoRow | null;
  onFechar: () => void;
  onEmitido?: () => void;
};

const POLL_INTERVALO_MS = 2500;
const POLL_MAX_TENTATIVAS = 48;

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

function fmtCpf(doc: string | null | undefined) {
  if (!doc) return "—";
  const d = doc.replace(/\D/g, "");
  if (d.length !== 11) return doc;
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ModalBackdrop({
  children,
  tituloId,
  fechar,
  podeFechar = true,
}: {
  children: ReactNode;
  tituloId: string;
  fechar: () => void;
  podeFechar?: boolean;
}) {
  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          {children}
          {podeFechar ? (
            <button
              type="button"
              className="close position-absolute"
              style={{ right: "1rem", top: "1rem", zIndex: 1 }}
              aria-label="Fechar"
              onClick={fechar}
            >
              <span aria-hidden>&times;</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ConteudoNotaEmitida({
  nf,
  pacienteNome,
  valorTotal,
}: {
  nf: NfseEmissao;
  pacienteNome: string;
  valorTotal: number;
}) {
  return (
    <div className="text-center py-2">
      <div className="mb-3">
        <span className="badge badge-success badge-lg px-3 py-2">Autorizada</span>
      </div>
      <h5 className="mb-3">NFS-e emitida com sucesso</h5>
      <dl className="row small text-left mb-4">
        <dt className="col-sm-4">Paciente</dt>
        <dd className="col-sm-8">{pacienteNome}</dd>
        <dt className="col-sm-4">Valor</dt>
        <dd className="col-sm-8 font-weight-bold">
          {fmtBrl(nf.valor_servicos ?? valorTotal)}
        </dd>
        {nf.numero_nfse ? (
          <>
            <dt className="col-sm-4">Número NFS-e</dt>
            <dd className="col-sm-8">
              <strong>{nf.numero_nfse}</strong>
            </dd>
          </>
        ) : null}
        {nf.numero_rps ? (
          <>
            <dt className="col-sm-4">RPS</dt>
            <dd className="col-sm-8">
              {nf.numero_rps}
              {nf.serie_rps ? ` / série ${nf.serie_rps}` : ""}
            </dd>
          </>
        ) : null}
        {nf.codigo_verificacao ? (
          <>
            <dt className="col-sm-4">Código verificação</dt>
            <dd className="col-sm-8">{nf.codigo_verificacao}</dd>
          </>
        ) : null}
        {nf.discriminacao ? (
          <>
            <dt className="col-sm-4">Discriminação</dt>
            <dd className="col-sm-8">{nf.discriminacao}</dd>
          </>
        ) : null}
      </dl>
      {nf.url_danfse ? (
        <a
          href={nf.url_danfse}
          target="_blank"
          rel="noreferrer"
          className="btn btn-primary btn-lg"
        >
          <i className="fas fa-file-pdf mr-2" aria-hidden />
          Abrir DANFSe (PDF)
        </a>
      ) : (
        <p className="text-muted small mb-0">
          PDF ainda não disponível. Consulte novamente mais tarde no histórico.
        </p>
      )}
    </div>
  );
}

function ModalConfirmarCancelamentoNfse({
  cancelando,
  onFechar,
  onConfirmar,
}: {
  cancelando: boolean;
  onFechar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", zIndex: 1060 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="nfse-confirm-cancel-titulo"
    >
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content">
          <div className="modal-header bg-light">
            <h5 className="modal-title" id="nfse-confirm-cancel-titulo">
              Confirmar cancelamento
            </h5>
            <button
              type="button"
              className="close"
              aria-label="Fechar"
              disabled={cancelando}
              onClick={onFechar}
            >
              <span aria-hidden>&times;</span>
            </button>
          </div>
          <div className="modal-body">
            <p className="mb-0">
              Confirma o cancelamento desta NFS-e na prefeitura? Esta ação não pode ser desfeita.
            </p>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={cancelando}
              onClick={onFechar}
            >
              Voltar
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={cancelando}
              onClick={onConfirmar}
            >
              {cancelando ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm mr-2"
                    role="status"
                    aria-hidden
                  />
                  Cancelando…
                </>
              ) : (
                "Confirmar cancelamento"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModalEmissaoNfse({ row, onFechar, onEmitido }: Props) {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<DetalheResponse | null>(null);
  const [discriminacao, setDiscriminacao] = useState<string | null>(null);
  const [fase, setFase] = useState<FaseModal>("detalhe");
  const [processoMsg, setProcessoMsg] = useState("Enviando NFS-e à Focus NFe…");
  const [notaEmitida, setNotaEmitida] = useState<NfseEmissao | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!row) return;
    setLoading(true);
    setErro(null);
    setOkMsg(null);
    try {
      const res = await fetch(
        `/api/nota-fiscal/emissao/detalhe?id_agendamento=${row.id}`,
        { credentials: "include" },
      );
      const j = (await res.json()) as DetalheResponse & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar detalhes.");
      setDetalhe(j);
      const procs = j.agendamento.procedimentos
        .map((p) => (p.procedimento ?? "").trim())
        .filter(Boolean);
      setDiscriminacao(procs.length > 0 ? procs.join("; ") : null);

      if (j.nfse && (j.nfse.status ?? "").toLowerCase() === "autorizado") {
        setNotaEmitida(j.nfse);
        setFase("resultado");
      } else {
        setNotaEmitida(null);
        setFase("detalhe");
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setDetalhe(null);
      setFase("detalhe");
    } finally {
      setLoading(false);
    }
  }, [row]);

  useEffect(() => {
    if (row) {
      setFase("detalhe");
      setNotaEmitida(null);
      setCancelando(false);
      setConfirmCancelId(null);
      setOkMsg(null);
      setProcessoMsg("Enviando NFS-e à Focus NFe…");
      void carregar();
    }
  }, [row, carregar]);

  const consultarPorId = async (emissaoId: string): Promise<ConsultarRes> => {
    const res = await fetch("/api/focusnfe/nfse/consultar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id: emissaoId }),
    });
    const j = (await res.json()) as ConsultarRes;
    if (!res.ok) throw new Error(j.error ?? "Erro ao consultar NFS-e.");
    return j;
  };

  const aguardarAutorizacao = async (emissaoId: string): Promise<NfseEmissao> => {
    setProcessoMsg("Aguardando autorização da prefeitura…");
    for (let t = 0; t < POLL_MAX_TENTATIVAS; t++) {
      await sleep(POLL_INTERVALO_MS);
      const j = await consultarPorId(emissaoId);
      const status = (j.focus?.status ?? j.emissao?.status ?? "").toLowerCase();
      const interno = statusInternoDeFocus(status);

      if (interno === "autorizado" && j.emissao) {
        return j.emissao;
      }
      if (interno === "erro") {
        throw new Error(
          mensagemErroFocusNfse(j.emissao?.error_message) ??
            mensagemErroFocusNfse(j.focus) ??
            mensagemErroFocusNfseOuFallback(null),
        );
      }
    }
    throw new Error(
      "Tempo esgotado aguardando autorização. Tente consultar o status mais tarde.",
    );
  };

  const executarCancelamento = async (emissaoId: string) => {
    setCancelando(true);
    setErro(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/focusnfe/nfse/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: emissaoId }),
      });
      const j = (await res.json()) as { error?: string; emissao?: NfseEmissao };
      if (!res.ok) throw new Error(j.error ?? "Erro ao cancelar NFS-e.");
      setConfirmCancelId(null);
      setNotaEmitida(null);
      setFase("detalhe");
      setOkMsg("NFS-e cancelada com sucesso. Você pode emitir uma nova nota, se necessário.");
      await carregar();
      onEmitido?.();
    } catch (e) {
      setConfirmCancelId(null);
      setErro(e instanceof Error ? e.message : "Erro ao cancelar.");
    } finally {
      setCancelando(false);
    }
  };

  const emitir = async () => {
    if (!row) return;
    setFase("processando");
    setProcessoMsg("Enviando NFS-e à Focus NFe…");
    setErro(null);

    try {
      const res = await fetch("/api/focusnfe/nfse/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id_agendamento: row.id }),
      });
      const j = (await res.json()) as {
        error?: string;
        emissao?: { id: string; status?: string };
        focus?: { status?: string };
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao emitir NFS-e.");

      const emissaoId = j.emissao?.id;
      if (!emissaoId) throw new Error("Resposta de emissão inválida.");

      const statusInicial = (j.focus?.status ?? j.emissao?.status ?? "").toLowerCase();
      let nf: NfseEmissao;

      if (statusInicial === "autorizado") {
        const consulta = await consultarPorId(emissaoId);
        if (!consulta.emissao) throw new Error("NFS-e autorizada, mas sem dados na consulta.");
        nf = consulta.emissao;
      } else {
        nf = await aguardarAutorizacao(emissaoId);
      }

      setNotaEmitida(nf);
      setFase("resultado");
      onEmitido?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao emitir.");
      setFase("detalhe");
    }
  };

  if (!row) return null;

  const pac = detalhe?.paciente;
  const comTomador = pac ? cpfValidoParaTomadorNfse(pac.cpf) : false;
  const nfExistente = detalhe?.nfse;
  const jaEmitida = nfExistente ? bloqueiaReemissaoFocusNfse(nfExistente.status) : false;
  const podeCancelarExistente =
    nfExistente && podeCancelarFocusNfse(nfExistente.status);
  const nfCancelada =
    nfExistente && (nfExistente.status ?? "").toLowerCase() === "cancelado";
  const pacienteNome = pac?.nome ?? row.paciente_nome;
  const valorTotal = detalhe?.agendamento.valor_total ?? row.valor_total;

  const modalConfirmarCancelamento = confirmCancelId ? (
    <ModalConfirmarCancelamentoNfse
      cancelando={cancelando}
      onFechar={() => {
        if (!cancelando) setConfirmCancelId(null);
      }}
      onConfirmar={() => void executarCancelamento(confirmCancelId)}
    />
  ) : null;

  if (fase === "processando") {
    return (
      <>
      <ModalBackdrop tituloId="nfse-processando-titulo" fechar={onFechar} podeFechar={false}>
        <div className="modal-body text-center py-5">
          <div
            className="spinner-border text-primary mb-4"
            style={{ width: "3rem", height: "3rem" }}
            role="status"
          >
            <span className="sr-only">Processando…</span>
          </div>
          <h5 className="mb-2" id="nfse-processando-titulo">
            Emitindo NFS-e
          </h5>
          <p className="text-muted mb-0">{processoMsg}</p>
          <p className="text-muted small mt-3 mb-0">
            Atendimento #{row.id} · {pacienteNome}
          </p>
        </div>
      </ModalBackdrop>
      {modalConfirmarCancelamento}
      </>
    );
  }

  const podeCancelarNota =
    notaEmitida && podeCancelarFocusNfse(notaEmitida.status);

  if (fase === "resultado" && notaEmitida) {
    return (
      <>
      <ModalBackdrop tituloId="nfse-resultado-titulo" fechar={onFechar} podeFechar={!cancelando && !confirmCancelId}>
        <div className="modal-header border-0 pb-0">
          <h5 className="modal-title w-100 text-center" id="nfse-resultado-titulo">
            Nota fiscal de serviço
          </h5>
        </div>
        <div className="modal-body pt-2">
          {erro ? (
            <div className="alert alert-danger" role="alert">
              {erro}
            </div>
          ) : null}
          <ConteudoNotaEmitida
            nf={notaEmitida}
            pacienteNome={pacienteNome}
            valorTotal={valorTotal}
          />
        </div>
        <div className="modal-footer justify-content-center border-0 pt-0 flex-wrap gap-2">
          {podeCancelarNota ? (
            <button
              type="button"
              className="btn btn-outline-danger"
              disabled={cancelando || !!confirmCancelId}
              onClick={() => setConfirmCancelId(notaEmitida.id)}
            >
              <i className="fas fa-ban mr-1" aria-hidden />
              Cancelar NFS-e
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onFechar}
            disabled={cancelando || !!confirmCancelId}
          >
            Fechar
          </button>
        </div>
      </ModalBackdrop>
      {modalConfirmarCancelamento}
      </>
    );
  }

  return (
    <>
    <ModalBackdrop tituloId="nfse-emissao-titulo" fechar={onFechar} podeFechar={!confirmCancelId}>
      <div className="modal-header">
        <h5 className="modal-title" id="nfse-emissao-titulo">
          Emitir NFS-e — atendimento #{row.id}
        </h5>
      </div>
      <div className="modal-body">
        {loading ? (
          <p className="text-muted text-center py-4">
            <span className="spinner-border spinner-border-sm mr-2" role="status" aria-hidden />
            Carregando…
          </p>
        ) : (
          <>
            {erro ? (
              <div className="alert alert-danger" role="alert">
                {erro}
              </div>
            ) : null}
            {okMsg ? (
              <div className="alert alert-success" role="alert">
                {okMsg}
              </div>
            ) : null}

            {nfExistente &&
            statusInternoDeFocus(nfExistente.status) === "erro" &&
            nfExistente.error_message ? (
              <div className="alert alert-danger" role="alert">
                <strong>Última tentativa rejeitada:</strong> {nfExistente.error_message}
              </div>
            ) : null}

            {nfCancelada && nfExistente ? (
              <div className="alert alert-secondary" role="alert">
                A NFS-e deste atendimento foi <strong>cancelada</strong>
                {nfExistente.numero_nfse ? ` (nº ${nfExistente.numero_nfse})` : ""}. É possível
                emitir uma nova nota.
              </div>
            ) : null}

            {jaEmitida && nfExistente ? (
              <div className="alert alert-info" role="alert">
                Este atendimento já possui NFS-e
                {nfExistente.status.toLowerCase() === "autorizado" ? " emitida" : " em processamento"}
                {nfExistente.numero_nfse ? ` (nº ${nfExistente.numero_nfse})` : ""}. Não é possível
                emitir novamente.
              </div>
            ) : null}

            <h6 className="text-uppercase text-muted small">
              Paciente{comTomador ? " (tomador)" : ""}
            </h6>
            {pac && !comTomador ? (
              <p className="alert alert-warning small py-2">
                Sem CPF cadastrado — a NFS-e será emitida <strong>sem tomador</strong>.
              </p>
            ) : null}
            {pac ? (
              <dl className="row small mb-4">
                <dt className="col-sm-3">Nome</dt>
                <dd className="col-sm-9">{pac.nome}</dd>
                <dt className="col-sm-3">CPF</dt>
                <dd className="col-sm-9">{comTomador ? fmtCpf(pac.cpf) : "Não informado"}</dd>
                <dt className="col-sm-3">E-mail</dt>
                <dd className="col-sm-9">{pac.email?.trim() || "—"}</dd>
                <dt className="col-sm-3">Telefone</dt>
                <dd className="col-sm-9">{pac.telefone?.trim() || "—"}</dd>
              </dl>
            ) : (
              <p className="text-muted">Paciente não encontrado.</p>
            )}

            <h6 className="text-uppercase text-muted small">Atendimento</h6>
            {detalhe ? (
              <dl className="row small mb-4">
                <dt className="col-sm-3">Data/hora</dt>
                <dd className="col-sm-9">{fmtDataHora(detalhe.agendamento.data_hora_inicio)}</dd>
                <dt className="col-sm-3">Profissional</dt>
                <dd className="col-sm-9">{detalhe.agendamento.profissional_nome}</dd>
                <dt className="col-sm-3">Total</dt>
                <dd className="col-sm-9 font-weight-bold">
                  {fmtBrl(detalhe.agendamento.valor_total)}
                </dd>
                <dt className="col-sm-3">Procedimentos</dt>
                <dd className="col-sm-9">
                  <ul className="list-unstyled mb-0">
                    {detalhe.agendamento.procedimentos.map((p, i) => (
                      <li key={i}>
                        {(p.procedimento ?? "Procedimento").trim()}{" "}
                        <span className="text-muted">({fmtBrl(p.valor_aplicado)})</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </dl>
            ) : null}

            <div className="form-group mb-0">
              <label className="d-block">Discriminação do serviço</label>
              {discriminacao ? (
                <p className="mb-0 font-weight-bold">{discriminacao}</p>
              ) : (
                <p className="text-danger mb-0">
                  Nenhum procedimento lançado — não é possível emitir a NFS-e.
                </p>
              )}
            </div>
          </>
        )}
      </div>
      <div className="modal-footer flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={onFechar}>
          Fechar
        </button>
        {podeCancelarExistente && nfExistente ? (
          <button
            type="button"
            className="btn btn-outline-danger"
            disabled={loading || cancelando || !!confirmCancelId}
            onClick={() => setConfirmCancelId(nfExistente.id)}
          >
            <i className="fas fa-ban mr-1" aria-hidden />
            Cancelar NFS-e
          </button>
        ) : null}
        {!jaEmitida ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              loading || !detalhe?.paciente || !discriminacao || cancelando || !!confirmCancelId
            }
            onClick={() => void emitir()}
          >
            <i className="fas fa-file-invoice mr-1" aria-hidden />
            Emitir NFS-e
          </button>
        ) : null}
      </div>
    </ModalBackdrop>
    {modalConfirmarCancelamento}
    </>
  );
}
