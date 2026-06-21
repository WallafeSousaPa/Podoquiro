"use client";

import type { CaixaAgendamentoRow } from "./caixa-client";
import { gerarDanfeNfcePdfUrl } from "@/lib/client/render-danfe-nfce-pdf";
import type { NfceAtendimentoContexto } from "@/lib/financeiro/nfce-atendimento";
import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type EmissaoResposta = {
  ok?: boolean;
  chave?: string;
  nNF?: number;
  serie?: number;
  cStatProt?: string | null;
  cStatLote?: string | null;
  xMotivo?: string;
  protocolo?: string | null;
  qrCode?: string;
  urlChave?: string;
  idRegistro?: string;
  error?: string;
};

type Props = {
  row: CaixaAgendamentoRow | null;
  onFechar: () => void;
  onEmitido?: () => void;
};

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

const TPAG_LABEL: Record<string, string> = {
  "01": "Dinheiro",
  "03": "Cartão de Crédito",
  "04": "Cartão de Débito",
  "17": "PIX",
  "99": "Outros",
};

function labelFormaPagamento(tPag: string) {
  const t = tPag.replace(/\D/g, "").padStart(2, "0").slice(0, 2);
  return TPAG_LABEL[t] ?? `Pagamento (${t})`;
}

export function ModalEmissaoNfceCaixa({ row, onFechar, onEmitido }: Props) {
  const [detalhe, setDetalhe] = useState<NfceAtendimentoContexto | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<EmissaoResposta | null>(null);
  const [danfeCarregando, setDanfeCarregando] = useState(false);

  const idAgendamento = row?.id ?? null;

  const carregarDetalhe = useCallback(async () => {
    if (!idAgendamento) return;
    setCarregando(true);
    setErro(null);
    setResultado(null);
    try {
      const res = await fetch(
        `/api/nfce/atendimento-detalhe?id_agendamento=${encodeURIComponent(String(idAgendamento))}`,
        { credentials: "include" },
      );
      const j = (await res.json()) as NfceAtendimentoContexto & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar o atendimento.");
      setDetalhe(j);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar o atendimento.");
      setDetalhe(null);
    } finally {
      setCarregando(false);
    }
  }, [idAgendamento]);

  useEffect(() => {
    if (!row) {
      setDetalhe(null);
      setErro(null);
      setResultado(null);
      return;
    }
    void carregarDetalhe();
  }, [row, carregarDetalhe]);

  const imprimirDanfe = useCallback(async (nfceId: string) => {
    setDanfeCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/nfce/danfe-dados?id=${encodeURIComponent(nfceId)}`, {
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Falha ao carregar dados do DANFE.");
      const url = await gerarDanfeNfcePdfUrl(j);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar o DANFE.");
    } finally {
      setDanfeCarregando(false);
    }
  }, []);

  const emitir = useCallback(async () => {
    if (!idAgendamento) return;
    setErro(null);
    setResultado(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/nfce/emitir", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_agendamento: idAgendamento }),
      });
      const j = (await res.json()) as EmissaoResposta;
      if (!res.ok) {
        setErro(j.error ?? j.xMotivo ?? "Falha ao emitir a NFC-e.");
        setResultado(j);
        return;
      }
      if (!j.ok) {
        setErro(j.error ?? j.xMotivo ?? "A SEFAZ rejeitou a nota.");
        setResultado(j);
        return;
      }
      setResultado(j);
      onEmitido?.();
      void carregarDetalhe();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao emitir a NFC-e.");
    } finally {
      setEnviando(false);
    }
  }, [idAgendamento, onEmitido, carregarDetalhe]);

  if (!row) return null;

  const nfceExistente = detalhe?.nfce_autorizada;
  const autorizada = resultado?.ok === true;
  const totalProdutos = detalhe?.produtos.reduce((s, p) => s + p.valor_final, 0) ?? 0;

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-nfce-caixa-titulo"
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="modal-nfce-caixa-titulo">
              <i className="fas fa-receipt mr-2" aria-hidden />
              NFC-e / DANFE — atendimento #{row.id}
            </h5>
            <button
              type="button"
              className="close"
              aria-label="Fechar"
              onClick={onFechar}
              disabled={enviando}
            >
              <span aria-hidden>&times;</span>
            </button>
          </div>

          <div className="modal-body">
            {carregando ? (
              <p className="text-muted text-center py-4">
                <span
                  className="spinner-border spinner-border-sm mr-2 align-middle"
                  role="status"
                  aria-hidden
                />
                Carregando atendimento…
              </p>
            ) : null}

            {erro ? (
              <div className="alert alert-danger" role="alert">
                {erro}
              </div>
            ) : null}

            {detalhe && !carregando ? (
              <>
                <dl className="row small mb-3">
                  <dt className="col-sm-4">Paciente</dt>
                  <dd className="col-sm-8">{detalhe.paciente_nome}</dd>
                  <dt className="col-sm-4">Data/hora</dt>
                  <dd className="col-sm-8">{fmtDataHora(detalhe.data_hora_inicio)}</dd>
                  <dt className="col-sm-4">Total atendimento</dt>
                  <dd className="col-sm-8 font-weight-bold">{fmtBrl(detalhe.valor_total)}</dd>
                  <dt className="col-sm-4">Total produtos</dt>
                  <dd className="col-sm-8">{fmtBrl(totalProdutos)}</dd>
                </dl>

                <h6 className="mb-2">Produtos</h6>
                <div className="table-responsive mb-3">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th className="text-right">Qtd.</th>
                        <th className="text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhe.produtos.map((p) => (
                        <tr key={p.id_produto}>
                          <td>{p.nome_produto ?? "Produto"}</td>
                          <td className="text-right">{p.qtd}</td>
                          <td className="text-right">{fmtBrl(p.valor_final)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {detalhe.pagamentos.length > 0 ? (
                  <>
                    <h6 className="mb-2">Pagamentos do atendimento</h6>
                    <ul className="list-unstyled small mb-3">
                      {detalhe.pagamentos.map((p, i) => (
                        <li key={i} className="mb-1">
                          {fmtBrl(p.valor_pago)}
                          <span className="text-muted">
                            {" "}
                            · {p.forma ?? "Forma"}
                            {p.maquineta ? ` · ${p.maquineta}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {detalhe.pagamentos_nfce.length > 0 ? (
                      <p className="text-muted small mb-3">
                        Na NFC-e:{" "}
                        {detalhe.pagamentos_nfce
                          .map((p) => `${fmtBrl(p.vPag)} · ${labelFormaPagamento(p.tPag)}`)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </>
                ) : null}

                {nfceExistente ? (
                  <div className="alert alert-success" role="alert">
                    <i className="fas fa-check-circle mr-1" aria-hidden />
                    NFC-e já autorizada — nº {nfceExistente.numero_nf ?? "—"}
                    {nfceExistente.chave_acesso ? (
                      <div
                        className="small text-monospace mt-1"
                        style={{ wordBreak: "break-all" }}
                      >
                        {nfceExistente.chave_acesso}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {autorizada && resultado ? (
                  <div className="alert alert-success" role="alert">
                    <i className="fas fa-check-circle mr-1" aria-hidden />
                    NFC-e autorizada! Nº {resultado.nNF} / série {resultado.serie}.
                    {resultado.protocolo ? (
                      <div className="small mt-1">Protocolo: {resultado.protocolo}</div>
                    ) : null}
                    {resultado.qrCode ? (
                      <div className="text-center mt-3">
                        <div
                          className="d-inline-block bg-white p-2 border rounded"
                          aria-label="QR Code da NFC-e"
                        >
                          <QRCodeSVG value={resultado.qrCode} size={160} level="M" />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {!autorizada && resultado && !resultado.ok ? (
                  <div className="alert alert-danger" role="alert">
                    <i className="fas fa-exclamation-triangle mr-1" aria-hidden />
                    {erro ?? resultado.error ?? resultado.xMotivo ?? "A SEFAZ rejeitou a nota."}
                    {resultado.cStatProt || resultado.cStatLote ? (
                      <div className="small mt-1">
                        cStat {resultado.cStatProt ?? resultado.cStatLote}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onFechar}
              disabled={enviando}
            >
              Fechar
            </button>
            {nfceExistente ? (
              <button
                type="button"
                className="btn btn-success"
                disabled={danfeCarregando}
                onClick={() => void imprimirDanfe(nfceExistente.id)}
              >
                {danfeCarregando ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm mr-2 align-middle"
                      role="status"
                      aria-hidden
                    />
                    Gerando PDF…
                  </>
                ) : (
                  <>
                    <i className="fas fa-print mr-1" aria-hidden />
                    Imprimir DANFE
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={enviando || carregando || !detalhe}
                onClick={() => void emitir()}
              >
                {enviando ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm mr-2 align-middle"
                      role="status"
                      aria-hidden
                    />
                    Emitindo…
                  </>
                ) : (
                  "Emitir NFC-e"
                )}
              </button>
            )}
            {autorizada && resultado?.idRegistro ? (
              <button
                type="button"
                className="btn btn-success"
                disabled={danfeCarregando}
                onClick={() => void imprimirDanfe(resultado.idRegistro!)}
              >
                <i className="fas fa-print mr-1" aria-hidden />
                Imprimir DANFE
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
