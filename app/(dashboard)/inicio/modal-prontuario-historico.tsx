"use client";

import type { HistoricoAtendimentoResumo } from "@/lib/prontuario/historico-atendimentos";
import { useId } from "react";
import { ProntuarioHistoricoTimeline } from "./prontuario-historico-timeline";

type Props = {
  open: boolean;
  pacienteNome: string;
  idAgendamentoAtual: number;
  historico: HistoricoAtendimentoResumo[];
  onClose: () => void;
};

export function ModalProntuarioHistorico({
  open,
  pacienteNome,
  idAgendamentoAtual,
  historico,
  onClose,
}: Props) {
  const titleId = useId();

  if (!open) return null;

  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block", zIndex: 1080 }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div
          className="modal-dialog modal-lg modal-prontuario-historico-dialog"
          role="document"
        >
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id={titleId}>
                Histórico de atendimentos
              </h5>
              <button
                type="button"
                className="close"
                onClick={onClose}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="modal-body">
              <p className="small text-muted mb-3">
                Paciente: <strong>{pacienteNome}</strong>
              </p>
              <ProntuarioHistoricoTimeline
                idAgendamentoAtual={idAgendamentoAtual}
                historico={historico}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: 1075 }}
        role="presentation"
        onClick={onClose}
      />
    </>
  );
}
