"use client";

import { useEffect, useId, useState } from "react";
import { rotuloStatusAgendamentoHistorico } from "@/lib/prontuario/historico-atendimentos";
import type { LinkPagoRow } from "@/lib/relatorios/links-pagos";

type AgDetalhe = {
  id: number;
  data_hora_inicio: string;
  data_hora_fim: string;
  status: string;
  valor_bruto: number;
  desconto: number;
  valor_total: number;
  taxa_agendamento_paga?: number;
  observacoes?: string | null;
  procedimentos: {
    id: number;
    id_procedimento: number;
    valor_aplicado: number;
  }[];
  produtos: {
    id: number;
    nome_produto: string | null;
    qtd: number;
    valor_desconto: number;
    valor_produto: number;
    valor_final: number;
  }[];
  pagamentos: {
    id: number;
    id_forma_pagamento: number;
    valor_pago: number;
    status_pagamento: string;
  }[];
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

function fmtDataRef(ymd: string) {
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
  } catch {
    return ymd;
  }
}

function badgeStatus(status: string) {
  const map: Record<string, string> = {
    pendente: "badge-warning",
    confirmado: "badge-primary",
    em_andamento: "badge-info",
    realizado: "badge-success",
    cancelado: "badge-secondary",
    faltou: "badge-secondary",
    adiado: "badge-primary",
    curativo_agendado: "badge-primary",
  };
  return (
    <span className={`badge ${map[status] ?? "badge-light"}`}>
      {rotuloStatusAgendamentoHistorico(status)}
    </span>
  );
}

function badgePagamento(status: string) {
  const map: Record<string, string> = {
    pago: "badge-success",
    pendente: "badge-warning",
    estornado: "badge-danger",
  };
  return (
    <span className={`badge ${map[status] ?? "badge-light"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

type Props = {
  row: LinkPagoRow;
  onClose: () => void;
};

export function ModalDetalheAtendimentoLinksPagos({ row, onClose }: Props) {
  const titleId = useId();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<AgDetalhe | null>(null);
  const [nomesProc, setNomesProc] = useState<Map<number, string>>(new Map());
  const [nomesForma, setNomesForma] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function carregar() {
      setLoading(true);
      setErro(null);
      setDetalhe(null);
      try {
        const [resAg, resFp] = await Promise.all([
          fetch(`/api/agendamentos/${row.id_agendamento}`, {
            credentials: "include",
          }),
          fetch("/api/formas-pagamento", { credentials: "include" }),
        ]);
        const jAg = (await resAg.json()) as { data?: AgDetalhe; error?: string };
        if (!resAg.ok) throw new Error(jAg.error ?? "Erro ao carregar atendimento.");
        if (!jAg.data) throw new Error("Resposta inválida.");

        const jFp = (await resFp.json()) as {
          data?: { id: number; nome: string }[];
        };
        const mapaForma = new Map<number, string>();
        for (const f of jFp.data ?? []) {
          mapaForma.set(f.id, f.nome?.trim() || `Forma #${f.id}`);
        }

        const idsProc = [
          ...new Set(jAg.data.procedimentos.map((p) => p.id_procedimento)),
        ];
        const mapaProc = new Map<number, string>();
        if (idsProc.length > 0 && jAg.data) {
          const idUsuario = row.id_usuario;
          const urlProc =
            idUsuario != null && idUsuario > 0
              ? `/api/procedimentos?id_usuario=${encodeURIComponent(String(idUsuario))}`
              : "/api/procedimentos";
          const resProc = await fetch(urlProc, { credentials: "include" });
          const jProc = (await resProc.json()) as {
            data?: { id: number; procedimento: string }[];
          };
          for (const p of jProc.data ?? []) {
            mapaProc.set(p.id, p.procedimento?.trim() || `Procedimento #${p.id}`);
          }
        }

        if (cancelled) return;
        setNomesForma(mapaForma);
        setNomesProc(mapaProc);
        setDetalhe(jAg.data);
      } catch (e) {
        if (cancelled) return;
        setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void carregar();
    return () => {
      cancelled = true;
    };
  }, [row.id_agendamento, row.id_usuario]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block", zIndex: 1055 }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div
          className="modal-dialog modal-lg modal-dialog-scrollable modal-dialog-centered"
          role="document"
          style={{ margin: "0.5rem auto", maxWidth: "min(800px, calc(100% - 1rem))" }}
        >
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id={titleId}>
                Atendimento #{row.id_agendamento}
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
              {loading ? (
                <p className="text-muted mb-0">
                  <i className="fas fa-spinner fa-spin mr-1" aria-hidden />
                  Carregando…
                </p>
              ) : erro && !detalhe ? (
                <div className="alert alert-danger py-2 small mb-0" role="alert">
                  {erro}
                </div>
              ) : detalhe ? (
                <>
                  <p className="mb-1">
                    <strong>{row.paciente}</strong>
                  </p>
                  <ul className="small text-muted pl-3 mb-3">
                    <li>Início: {fmtDataHora(detalhe.data_hora_inicio)}</li>
                    <li>Término: {fmtDataHora(detalhe.data_hora_fim)}</li>
                    <li>Profissional: {row.profissional}</li>
                    <li>Status: {badgeStatus(detalhe.status)}</li>
                  </ul>

                  <div className="alert alert-success py-2 small mb-3" role="status">
                    <strong>Link pago</strong> em {fmtDataRef(row.dia)} —{" "}
                    {row.forma_pagamento}: <strong>{fmtBrl(row.valor)}</strong>
                  </div>

                  {erro ? (
                    <div className="alert alert-danger py-2 small" role="alert">
                      {erro}
                    </div>
                  ) : null}

                  <div className="row mb-3">
                    <div className="col-sm-4">
                      <div className="small text-muted">Valor bruto</div>
                      <div className="font-weight-bold">
                        {fmtBrl(detalhe.valor_bruto)}
                      </div>
                    </div>
                    <div className="col-sm-4">
                      <div className="small text-muted">Desconto</div>
                      <div className="font-weight-bold">
                        {fmtBrl(detalhe.desconto)}
                      </div>
                    </div>
                    <div className="col-sm-4">
                      <div className="small text-muted">Valor total</div>
                      <div className="font-weight-bold">
                        {fmtBrl(detalhe.valor_total)}
                      </div>
                    </div>
                  </div>

                  {(detalhe.taxa_agendamento_paga ?? 0) > 0 ? (
                    <p className="small mb-3">
                      Taxa de agendamento paga:{" "}
                      <strong>{fmtBrl(Number(detalhe.taxa_agendamento_paga))}</strong>
                    </p>
                  ) : null}

                  <strong className="d-block mb-2">Procedimentos</strong>
                  <ul className="small mb-3">
                    {detalhe.procedimentos.length === 0 ? (
                      <li className="text-muted">—</li>
                    ) : (
                      detalhe.procedimentos.map((p) => (
                        <li key={p.id}>
                          {nomesProc.get(p.id_procedimento) ??
                            `Procedimento #${p.id_procedimento}`}{" "}
                          — {fmtBrl(p.valor_aplicado)}
                        </li>
                      ))
                    )}
                  </ul>

                  <strong className="d-block mb-2">Produtos</strong>
                  <ul className="small mb-3">
                    {(detalhe.produtos ?? []).length === 0 ? (
                      <li className="text-muted">—</li>
                    ) : (
                      detalhe.produtos.map((p) => (
                        <li key={p.id}>
                          {p.nome_produto ?? "Produto"} · {p.qtd} ×{" "}
                          {fmtBrl(p.valor_produto)}
                          {p.valor_desconto > 0
                            ? ` · desc. ${fmtBrl(p.valor_desconto)}`
                            : ""}{" "}
                          → {fmtBrl(p.valor_final)}
                        </li>
                      ))
                    )}
                  </ul>

                  <strong className="d-block mb-2">Pagamentos do atendimento</strong>
                  <ul className="small mb-3">
                    {detalhe.pagamentos.length === 0 ? (
                      <li className="text-muted">—</li>
                    ) : (
                      detalhe.pagamentos.map((p) => (
                        <li key={p.id}>
                          {fmtBrl(p.valor_pago)} ·{" "}
                          {nomesForma.get(p.id_forma_pagamento) ??
                            `Forma #${p.id_forma_pagamento}`}{" "}
                          · {badgePagamento(p.status_pagamento)}
                        </li>
                      ))
                    )}
                  </ul>

                  {detalhe.observacoes?.trim() ? (
                    <>
                      <strong className="d-block mb-2">Observações</strong>
                      <p className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>
                        {detalhe.observacoes.trim()}
                      </p>
                    </>
                  ) : null}
                </>
              ) : null}
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
        style={{ zIndex: 1050 }}
        role="presentation"
        onClick={onClose}
      />
    </>
  );
}
