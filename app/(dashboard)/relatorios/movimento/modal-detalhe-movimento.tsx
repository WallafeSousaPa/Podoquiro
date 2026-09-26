"use client";

import { useEffect, useId } from "react";
import type { LinhaRelatorioMovimento } from "@/lib/relatorios/movimento";

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDataRef(ymd: string) {
  if (!ymd) return "—";
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
  } catch {
    return ymd;
  }
}

function fmtDataHora(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type Props = {
  linha: LinhaRelatorioMovimento;
  onClose: () => void;
};

export function ModalDetalheMovimento({ linha, onClose }: Props) {
  const titleId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tituloMaq = linha.maquineta ? ` · ${linha.maquineta}` : "";

  return (
    <>
      <div
        className="modal fade show relatorio-movimento-modal no-print"
        style={{ display: "block", zIndex: 1055 }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-dialog modal-lg modal-dialog-scrollable" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id={titleId}>
                {linha.forma}
                {tituloMaq}
              </h5>
              <button type="button" className="close" onClick={onClose} aria-label="Fechar">
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="modal-body p-0">
              <div className="px-3 pt-3 pb-2 small text-muted">
                {linha.quantidade} lançamento{linha.quantidade === 1 ? "" : "s"} · total{" "}
                <strong>{fmtBrl(linha.total)}</strong>
              </div>
              <div className="table-responsive">
                <table className="table table-sm table-striped table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th>Atendimento</th>
                      <th>Paciente</th>
                      <th>Profissional</th>
                      <th>Tipo</th>
                      <th className="text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linha.lancamentos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted py-3">
                          Nenhum lançamento.
                        </td>
                      </tr>
                    ) : (
                      linha.lancamentos.map((l) => (
                        <tr key={l.id}>
                          <td>
                            {fmtDataRef(l.dia)}
                            <div className="small text-muted">
                              {fmtDataHora(l.data_movimentacao)}
                            </div>
                          </td>
                          <td>
                            {l.atendimento_id != null ? (
                              <>
                                #{l.atendimento_id}
                                <div className="small text-muted">
                                  {fmtDataHora(l.data_hora_atendimento)}
                                </div>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {l.paciente}
                            {l.descricao !== "—" && l.descricao !== l.paciente ? (
                              <div className="small text-muted">{l.descricao}</div>
                            ) : null}
                          </td>
                          <td>{l.profissional}</td>
                          <td>{l.tipo_label}</td>
                          <td className="text-right">{fmtBrl(l.valor)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {linha.lancamentos.length > 0 ? (
                    <tfoot>
                      <tr>
                        <th colSpan={5}>Total</th>
                        <th className="text-right">{fmtBrl(linha.total)}</th>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
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
        className="modal-backdrop fade show no-print"
        style={{ zIndex: 1050 }}
        role="presentation"
        onClick={onClose}
      />
    </>
  );
}
