"use client";

import { type ReactNode, useCallback, useEffect, useId, useState } from "react";
import {
  ROTULO_ORIGEM_MOVIMENTACAO_ESTOQUE,
  type OrigemMovimentacaoEstoque,
} from "@/lib/estoque/registrar-movimentacao-estoque";

type MovimentacaoRow = {
  id: number;
  tipo: "entrada" | "saida";
  quantidade: number;
  saldo_anterior: number;
  saldo_posterior: number;
  origem: OrigemMovimentacaoEstoque;
  id_agendamento: number | null;
  observacao: string | null;
  created_at: string;
  usuarios: { nome_completo: string | null; usuario: string | null } | null;
};

type ProdutoInfo = {
  id: string;
  produto: string;
  servico: boolean;
  qtd_estoque: number;
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
      />
    </>
  );
}

function formatDataHora(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function nomeUsuario(
  u: MovimentacaoRow["usuarios"],
): string {
  if (!u) return "—";
  const nome = u.nome_completo?.trim();
  if (nome) return nome;
  const login = u.usuario?.trim();
  return login || "—";
}

export function ModalHistoricoEstoqueProduto({
  idProduto,
  nomeProduto,
  onClose,
}: {
  idProduto: string;
  nomeProduto: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [produto, setProduto] = useState<ProdutoInfo | null>(null);
  const [rows, setRows] = useState<MovimentacaoRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/produtos/${idProduto}/movimentacao-estoque`);
      const json = (await res.json()) as {
        error?: string;
        produto?: ProdutoInfo;
        data?: MovimentacaoRow[];
      };
      if (!res.ok) {
        setError(json.error ?? "Não foi possível carregar o histórico.");
        setRows([]);
        setProduto(null);
        return;
      }
      setProduto(json.produto ?? null);
      setRows(json.data ?? []);
    } catch {
      setError("Falha de comunicação ao carregar o histórico.");
      setRows([]);
      setProduto(null);
    } finally {
      setLoading(false);
    }
  }, [idProduto]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ModalBackdrop onBackdropClick={onClose}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={titleId}>
              Histórico de estoque — {nomeProduto}
            </h5>
            <button type="button" className="close" onClick={onClose}>
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="modal-body">
            {produto ? (
              <p className="small text-muted mb-3">
                Saldo atual: <strong>{produto.qtd_estoque}</strong>
                {produto.servico ? (
                  <span className="ml-2 badge badge-info">Serviço (sem movimentação)</span>
                ) : null}
              </p>
            ) : null}

            {loading ? (
              <p className="text-muted text-center py-4">
                <i className="fas fa-spinner fa-spin mr-2" aria-hidden />
                Carregando histórico…
              </p>
            ) : error ? (
              <div className="alert alert-danger py-2 small" role="alert">{error}</div>
            ) : rows.length === 0 ? (
              <p className="text-muted text-center py-4 mb-0">
                Nenhuma movimentação registrada para este produto.
              </p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-hover mb-0">
                  <thead className="thead-light">
                    <tr>
                      <th>Data</th>
                      <th>Tipo</th>
                      <th className="text-right">Qtd</th>
                      <th className="text-right">Saldo ant.</th>
                      <th className="text-right">Saldo</th>
                      <th>Origem</th>
                      <th>Atendimento</th>
                      <th>Usuário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="small text-nowrap">{formatDataHora(row.created_at)}</td>
                        <td>
                          {row.tipo === "entrada" ? (
                            <span className="badge badge-success">Entrada</span>
                          ) : (
                            <span className="badge badge-danger">Saída</span>
                          )}
                        </td>
                        <td className="text-right">{Number(row.quantidade)}</td>
                        <td className="text-right text-muted">{row.saldo_anterior}</td>
                        <td className="text-right">{row.saldo_posterior}</td>
                        <td className="small">
                          {ROTULO_ORIGEM_MOVIMENTACAO_ESTOQUE[row.origem] ?? row.origem}
                        </td>
                        <td className="small">
                          {row.id_agendamento ? `#${row.id_agendamento}` : "—"}
                        </td>
                        <td className="small">{nomeUsuario(row.usuarios)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
    </ModalBackdrop>
  );
}
