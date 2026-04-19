"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";

type FormaPagamentoRow = {
  id: number;
  nome: string;
  ativo: boolean;
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

type Props = {
  formasPagamento: FormaPagamentoRow[];
  loadError?: string | null;
};

export function TiposPagamentoClient({
  formasPagamento: formasProp,
  loadError,
}: Props) {
  const router = useRouter();
  const modalTitleId = useId();
  const confirmTitleId = useId();

  const [rows, setRows] = useState<FormaPagamentoRow[]>(formasProp);
  useEffect(() => {
    setRows(formasProp);
  }, [formasProp]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FormaPagamentoRow | null>(null);
  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{
    row: FormaPagamentoRow;
    acao: "ativar" | "inativar";
  } | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; message: string } | null>(
    null,
  );

  function resetForm() {
    setEditing(null);
    setNome("");
    setAtivo(true);
    setFormError(null);
  }

  function openCreate() {
    resetForm();
    setAtivo(true);
    setModalOpen(true);
  }

  function openEdit(row: FormaPagamentoRow) {
    setEditing(row);
    setNome(row.nome);
    setAtivo(row.ativo);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    resetForm();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setFormError("Informe o nome do tipo de pagamento.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        nome: nomeTrim,
        ativo,
      };
      const url = editing
        ? `/api/formas-pagamento/${editing.id}`
        : "/api/formas-pagamento";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar tipo de pagamento.");

      closeModal();
      setFeedback({
        title: editing ? "Tipo atualizado" : "Tipo cadastrado",
        message: editing
          ? `As alterações em "${nomeTrim}" foram salvas.`
          : `O tipo "${nomeTrim}" foi cadastrado com sucesso.`,
      });
      router.refresh();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Erro ao salvar tipo de pagamento.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmarMudancaStatus() {
    if (!confirmStatus) return;
    setChangingStatus(true);
    setListError(null);
    try {
      const novoAtivo = confirmStatus.acao === "ativar";
      const res = await fetch(`/api/formas-pagamento/${confirmStatus.row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: novoAtivo }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setListError(json.error ?? "Erro ao atualizar status.");
        setConfirmStatus(null);
        return;
      }
      setFeedback({
        title: novoAtivo ? "Tipo ativado" : "Tipo inativado",
        message: novoAtivo
          ? `"${confirmStatus.row.nome}" foi ativado.`
          : `"${confirmStatus.row.nome}" foi inativado.`,
      });
      setConfirmStatus(null);
      router.refresh();
    } finally {
      setChangingStatus(false);
    }
  }

  if (loadError) {
    return (
      <div className="alert alert-danger" role="alert">
        {loadError}
      </div>
    );
  }

  return (
    <>
      {listError ? (
        <div className="alert alert-warning alert-dismissible fade show" role="alert">
          <button
            type="button"
            className="close"
            aria-label="Fechar"
            onClick={() => setListError(null)}
          >
            <span aria-hidden="true">&times;</span>
          </button>
          {listError}
        </div>
      ) : null}

      <div className="card card-outline card-primary">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center">
          <h3 className="card-title mb-2 mb-sm-0">Tipos de pagamento cadastrados</h3>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={openCreate}
          >
            <i className="fas fa-plus mr-1" aria-hidden /> Novo tipo
          </button>
        </div>
        <div className="card-body table-responsive p-0">
          <table className="table table-hover table-striped mb-0">
            <thead>
              <tr>
                <th style={{ width: "70px" }}>ID</th>
                <th>Nome</th>
                <th style={{ width: "90px" }}>Status</th>
                <th style={{ width: "220px" }} className="text-right">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-4">
                    Nenhum tipo de pagamento cadastrado.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.nome}</td>
                    <td>
                      {row.ativo ? (
                        <span className="badge badge-success">Ativo</span>
                      ) : (
                        <span className="badge badge-secondary">Inativo</span>
                      )}
                    </td>
                    <td className="text-right text-nowrap">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary mr-1"
                        onClick={() => openEdit(row)}
                      >
                        <i className="fas fa-edit" aria-hidden /> Editar
                      </button>
                      {row.ativo ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => setConfirmStatus({ row, acao: "inativar" })}
                        >
                          <i className="fas fa-ban" aria-hidden /> Desativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          onClick={() => setConfirmStatus({ row, acao: "ativar" })}
                        >
                          <i className="fas fa-check" aria-hidden /> Ativar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <ModalBackdrop onBackdropClick={closeModal}>
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <form onSubmit={(e) => void submit(e)}>
                <div className="modal-header">
                  <h5 className="modal-title" id={modalTitleId}>
                    {editing ? "Editar tipo de pagamento" : "Novo tipo de pagamento"}
                  </h5>
                  <button type="button" className="close" onClick={closeModal}>
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
                <div className="modal-body">
                  {formError ? (
                    <div className="alert alert-danger py-2 small" role="alert">
                      {formError}
                    </div>
                  ) : null}

                  <div className="form-group">
                    <label htmlFor="forma-pagamento-nome">Nome</label>
                    <input
                      id="forma-pagamento-nome"
                      className="form-control"
                      placeholder="Ex.: Pix, Cartão de crédito"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group mb-0">
                    <div className="custom-control custom-switch">
                      <input
                        type="checkbox"
                        className="custom-control-input"
                        id="forma-pagamento-ativo"
                        checked={ativo}
                        onChange={(e) => setAtivo(e.target.checked)}
                      />
                      <label className="custom-control-label" htmlFor="forma-pagamento-ativo">
                        Ativo
                      </label>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {confirmStatus ? (
        <ModalBackdrop
          onBackdropClick={() => {
            if (!changingStatus) setConfirmStatus(null);
          }}
        >
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <div className="modal-header bg-light">
                <h5 className="modal-title" id={confirmTitleId}>
                  {confirmStatus.acao === "ativar"
                    ? "Confirmar ativação"
                    : "Confirmar desativação"}
                </h5>
                <button
                  type="button"
                  className="close"
                  disabled={changingStatus}
                  onClick={() => setConfirmStatus(null)}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  {confirmStatus.acao === "ativar"
                    ? `Ativar o tipo "${confirmStatus.row.nome}"?`
                    : `Desativar o tipo "${confirmStatus.row.nome}"?`}
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={changingStatus}
                  onClick={() => setConfirmStatus(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={
                    confirmStatus.acao === "ativar"
                      ? "btn btn-success"
                      : "btn btn-danger"
                  }
                  disabled={changingStatus}
                  onClick={() => void confirmarMudancaStatus()}
                >
                  {changingStatus ? "Processando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {feedback ? (
        <ModalBackdrop onBackdropClick={() => setFeedback(null)}>
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title text-success">
                  <i className="fas fa-check-circle mr-2" aria-hidden />
                  {feedback.title}
                </h5>
                <button type="button" className="close" onClick={() => setFeedback(null)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body pt-2">
                <p className="mb-0">{feedback.message}</p>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button type="button" className="btn btn-primary" onClick={() => setFeedback(null)}>
                  OK
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </>
  );
}
