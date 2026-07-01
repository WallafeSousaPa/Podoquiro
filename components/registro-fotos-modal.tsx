"use client";

import { useId } from "react";

export type FotoRegistro = {
  label: string;
  url: string;
};

export type ModalFotosCtx = {
  titulo: string;
  subtitulo?: string;
  fotos: FotoRegistro[];
};

export function BotaoDataComFotos({
  dataFmt,
  qtdFotos,
  onAbrirFotos,
}: {
  dataFmt: string;
  qtdFotos: number;
  onAbrirFotos: () => void;
}) {
  if (qtdFotos <= 0) {
    return <span>{dataFmt}</span>;
  }
  return (
    <button
      type="button"
      className="btn btn-link btn-sm p-0 align-baseline font-weight-bold text-dark text-decoration-none"
      onClick={onAbrirFotos}
      title={`Ver ${qtdFotos} foto${qtdFotos === 1 ? "" : "s"}`}
    >
      {dataFmt}
      <span className="badge badge-light border ml-1 font-weight-normal">
        <i className="fas fa-camera mr-1 text-muted" aria-hidden />
        {qtdFotos}
      </span>
    </button>
  );
}

export function ModalFotosRegistro({
  ctx,
  onClose,
  zIndex = 1090,
}: {
  ctx: ModalFotosCtx;
  onClose: () => void;
  zIndex?: number;
}) {
  const titleId = useId();
  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block", zIndex }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div
          className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"
          role="document"
        >
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id={titleId}>
                {ctx.titulo}
              </h5>
              <button type="button" className="close" onClick={onClose} aria-label="Fechar">
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="modal-body">
              {ctx.subtitulo ? <p className="text-muted small mb-3">{ctx.subtitulo}</p> : null}
              {ctx.fotos.length === 0 ? (
                <p className="text-muted mb-0">Nenhuma foto neste registro.</p>
              ) : (
                <div className="row">
                  {ctx.fotos.map((foto) => (
                    <div key={`${foto.label}-${foto.url}`} className="col-12 col-sm-6 mb-3">
                      <div className="border rounded p-2 h-100">
                        <div className="small text-muted mb-2">{foto.label}</div>
                        <a href={foto.url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={foto.url}
                            alt={foto.label}
                            className="img-fluid rounded border"
                            style={{ width: "100%", maxHeight: 280, objectFit: "cover" }}
                            loading="lazy"
                          />
                        </a>
                        <a
                          href={foto.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-link btn-sm p-0 mt-2"
                        >
                          Abrir imagem
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
        style={{ zIndex: zIndex - 5 }}
        role="presentation"
        onClick={onClose}
      />
    </>
  );
}
