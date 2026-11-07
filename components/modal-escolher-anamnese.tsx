"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  pacienteNome: string;
  onPodologo: () => void;
  onEnfermagem: () => void;
  onClose: () => void;
};

export function ModalEscolherAnamnese({ pacienteNome, onPodologo, onEnfermagem, onClose }: Props) {
  const [portalOk, setPortalOk] = useState(false);
  useEffect(() => setPortalOk(true), []);
  if (!portalOk) return null;

  return createPortal(
    <>
      <div
        className="modal fade show"
        style={{ display: "block", zIndex: 1080 }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-escolher-anamnese"
      >
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="titulo-escolher-anamnese">
                Qual formulário abrir?
              </h5>
              <button type="button" className="close" aria-label="Fechar" onClick={onClose}>
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="modal-body">
              <p className="mb-3">
                Escolha o formulário de <strong>{pacienteNome}</strong>.
              </p>
              <div className="d-flex flex-column flex-sm-row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-primary flex-fill" onClick={onPodologo}>
                  Anamnese do podólogo
                </button>
                <button type="button" className="btn btn-outline-primary flex-fill" onClick={onEnfermagem}>
                  Avaliação de enfermagem
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" style={{ zIndex: 1070 }} onClick={onClose} />
    </>,
    document.body,
  );
}
