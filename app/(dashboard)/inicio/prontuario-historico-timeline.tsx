"use client";

import type { HistoricoAtendimentoDetalhe, HistoricoAtendimentoResumo } from "@/lib/prontuario/historico-atendimentos";
import { rotuloStatusAgendamentoHistorico } from "@/lib/prontuario/historico-atendimentos";
import { useCallback, useEffect, useId, useState } from "react";

function fmtDataHora(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function resumoProcedimentos(proc: { nome: string }[]): string {
  if (proc.length === 0) return "Sem procedimentos registrados";
  if (proc.length <= 2) return proc.map((p) => p.nome).join(", ");
  return `${proc[0]!.nome}, ${proc[1]!.nome} +${proc.length - 2}`;
}

function FotoHistoricoVisualizar({
  src,
  onAmpliar,
}: {
  src: string;
  onAmpliar: () => void;
}) {
  const [carregada, setCarregada] = useState(false);
  return (
    <button
      type="button"
      className="prontuario-foto-thumb prontuario-historico-foto-btn border rounded overflow-hidden p-0 mr-2 mb-2"
      style={{ width: 88, height: 88 }}
      onClick={onAmpliar}
      title="Ampliar foto"
    >
      {!carregada ? (
        <span className="d-flex align-items-center justify-content-center bg-light w-100 h-100">
          <span className="spinner-border spinner-border-sm text-secondary" role="status" />
        </span>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="w-100 h-100"
        style={{ objectFit: "cover", opacity: carregada ? 1 : 0 }}
        onLoad={() => setCarregada(true)}
        onError={() => setCarregada(true)}
      />
    </button>
  );
}

type Props = {
  idAgendamentoAtual: number;
  historico: HistoricoAtendimentoResumo[];
  disabled?: boolean;
};

export function ProntuarioHistoricoTimeline({
  idAgendamentoAtual,
  historico,
  disabled,
}: Props) {
  const detalheTitleId = useId();
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<HistoricoAtendimentoDetalhe | null>(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  const carregarDetalhe = useCallback(
    async (idHistorico: number) => {
      setLoadingDetalhe(true);
      setErroDetalhe(null);
      setDetalhe(null);
      try {
        const res = await fetch(
          `/api/prontuario/historico/${idHistorico}?id_agendamento_atual=${encodeURIComponent(String(idAgendamentoAtual))}`,
          { credentials: "include" },
        );
        const j = (await res.json()) as {
          data?: HistoricoAtendimentoDetalhe;
          error?: string;
        };
        if (!res.ok) throw new Error(j.error ?? "Erro ao carregar atendimento.");
        if (!j.data) throw new Error("Resposta inválida.");
        setDetalhe(j.data);
      } catch (e) {
        setErroDetalhe(e instanceof Error ? e.message : "Erro ao carregar.");
      } finally {
        setLoadingDetalhe(false);
      }
    },
    [idAgendamentoAtual],
  );

  useEffect(() => {
    if (selecionadoId == null) {
      setDetalhe(null);
      setErroDetalhe(null);
      return;
    }
    void carregarDetalhe(selecionadoId);
  }, [selecionadoId, carregarDetalhe]);

  if (historico.length === 0) {
    return (
      <p className="small text-muted mb-0">
        Nenhum outro agendamento encontrado para este paciente.
      </p>
    );
  }

  return (
    <>
      <div className="prontuario-historico-timeline" role="list">
        {historico.map((item, idx) => {
          const ativo = selecionadoId === item.id_agendamento;
          return (
            <div
              key={item.id_agendamento}
              className={`prontuario-historico-item ${ativo ? "prontuario-historico-item--ativo" : ""}`}
              role="listitem"
            >
              <button
                type="button"
                className="prontuario-historico-item-btn btn btn-link text-left w-100 p-0"
                disabled={disabled}
                onClick={() =>
                  setSelecionadoId((prev) =>
                    prev === item.id_agendamento ? null : item.id_agendamento,
                  )
                }
                aria-expanded={ativo}
                aria-controls={ativo ? detalheTitleId : undefined}
              >
                <span className="prontuario-historico-marcador" aria-hidden />
                <span className="prontuario-historico-corpo">
                  <span className="prontuario-historico-data d-block font-weight-bold small">
                    {fmtDataHora(item.data_hora_inicio)}
                  </span>
                  <span className="badge badge-secondary mt-1 mb-1">
                    {rotuloStatusAgendamentoHistorico(item.status)}
                  </span>
                  <span className="d-block small text-muted">
                    {item.responsavel_nome}
                  </span>
                  <span className="prontuario-historico-proc d-block small text-muted">
                    {resumoProcedimentos(item.procedimentos)}
                  </span>
                  {item.qtd_fotos > 0 ? (
                    <span className="badge badge-light border mt-1">
                      {item.qtd_fotos} foto{item.qtd_fotos > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </span>
              </button>
              {idx < historico.length - 1 ? (
                <span className="prontuario-historico-linha" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>

      {selecionadoId != null ? (
        <>
          <div
            className="modal fade show d-block"
            style={{ zIndex: 1086 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={detalheTitleId}
            onClick={() => setSelecionadoId(null)}
          >
            <div
              className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"
              role="document"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title" id={detalheTitleId}>
                    Detalhes do atendimento
                  </h5>
                  <button
                    type="button"
                    className="close"
                    onClick={() => setSelecionadoId(null)}
                    aria-label="Fechar"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
                <div className="modal-body">
                  {loadingDetalhe ? (
                    <p className="small text-muted mb-0">Carregando detalhes…</p>
                  ) : erroDetalhe ? (
                    <div className="alert alert-danger py-2 small mb-0">
                      {erroDetalhe}
                    </div>
                  ) : detalhe ? (
                    <>
                      <p className="small mb-2">
                        <strong>Data:</strong> {fmtDataHora(detalhe.data_hora_inicio)}
                        {detalhe.data_hora_fim ? (
                          <>
                            {" "}
                            —{" "}
                            <span className="text-muted">
                              até {fmtDataHora(detalhe.data_hora_fim)}
                            </span>
                          </>
                        ) : null}
                      </p>
                      <p className="small mb-2">
                        <strong>Status:</strong>{" "}
                        {rotuloStatusAgendamentoHistorico(detalhe.status)}
                      </p>
                      <p className="small mb-2">
                        <strong>Responsável:</strong> {detalhe.responsavel_nome}
                      </p>
                      <p className="small mb-1">
                        <strong>
                          {detalhe.tem_prontuario
                            ? "Procedimentos realizados (prontuário):"
                            : "Procedimentos do agendamento:"}
                        </strong>
                      </p>
                      {detalhe.procedimentos.length === 0 ? (
                        <p className="small text-muted mb-2">—</p>
                      ) : (
                        <ul className="small pl-3 mb-2">
                          {detalhe.procedimentos.map((p) => (
                            <li key={p.id_procedimento}>{p.nome}</li>
                          ))}
                        </ul>
                      )}
                      {detalhe.tem_prontuario &&
                      detalhe.procedimentos_agendamento.length > 0 &&
                      detalhe.procedimentos_agendamento.some(
                        (pa) =>
                          !detalhe.procedimentos.some(
                            (pr) => pr.id_procedimento === pa.id_procedimento,
                          ),
                      ) ? (
                        <>
                          <p className="small mb-1 text-muted">
                            <strong>Procedimentos previstos no agendamento:</strong>
                          </p>
                          <ul className="small pl-3 mb-2 text-muted">
                            {detalhe.procedimentos_agendamento.map((p) => (
                              <li key={`ag-${p.id_procedimento}`}>{p.nome}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      <p className="small mb-1">
                        <strong>Evolução / observações:</strong>
                      </p>
                      <p className="small mb-2 prontuario-historico-evolucao">
                        {detalhe.evolucao || (
                          <span className="text-muted">Sem evolução registrada.</span>
                        )}
                      </p>
                      {detalhe.observacoes_agendamento &&
                      detalhe.observacoes_agendamento !== detalhe.evolucao ? (
                        <>
                          <p className="small mb-1">
                            <strong>Obs. do agendamento:</strong>
                          </p>
                          <p className="small mb-2 text-muted">
                            {detalhe.observacoes_agendamento}
                          </p>
                        </>
                      ) : null}
                      <p className="small mb-1 font-weight-bold">Fotos</p>
                      {detalhe.fotos.length > 0 ? (
                        <div className="d-flex flex-wrap">
                          {detalhe.fotos.map((f) => (
                            <FotoHistoricoVisualizar
                              key={f.path}
                              src={f.url}
                              onAmpliar={() => setFotoAmpliada(f.url)}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="small text-muted mb-0">
                          Nenhuma foto registrada neste atendimento.
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSelecionadoId(null)}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div
            className="modal-backdrop fade show"
            style={{ zIndex: 1085 }}
            role="presentation"
            onClick={() => setSelecionadoId(null)}
          />
        </>
      ) : null}

      {fotoAmpliada ? (
        <>
          <div
            className="modal fade show d-block"
            style={{ zIndex: 1096 }}
            role="dialog"
            aria-modal="true"
            onClick={() => setFotoAmpliada(null)}
          >
            <div
              className="modal-dialog modal-dialog-centered modal-lg"
              role="document"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-content bg-transparent border-0">
                <div className="modal-header border-0 pb-0">
                  <button
                    type="button"
                    className="close text-white ml-auto"
                    onClick={() => setFotoAmpliada(null)}
                    aria-label="Fechar"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
                <div className="modal-body p-0 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fotoAmpliada}
                    alt=""
                    className="img-fluid rounded"
                    style={{ maxHeight: "85vh" }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div
            className="modal-backdrop fade show"
            style={{ zIndex: 1095 }}
            onClick={() => setFotoAmpliada(null)}
            role="presentation"
          />
        </>
      ) : null}
    </>
  );
}
