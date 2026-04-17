"use client";

import type { EmpresaGrupo } from "@/lib/data/empresa-grupos";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";

function formatarData(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

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
  initialRows: EmpresaGrupo[];
  loadError?: string | null;
};

export function EmpresaGruposClient({ initialRows, loadError }: Props) {
  const router = useRouter();
  const formTitleId = useId();
  const confirmTitleId = useId();
  const feedbackTitleId = useId();

  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmpresaGrupo | null>(null);
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmStatus, setConfirmStatus] = useState<{
    row: EmpresaGrupo;
    acao: "inativar" | "ativar";
  } | null>(null);
  const [statusAlterando, setStatusAlterando] = useState(false);

  const [feedbackModal, setFeedbackModal] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const [listError, setListError] = useState<string | null>(null);

  const openCreate = useCallback(() => {
    setEditing(null);
    setNome("");
    setFormError(null);
    setFormModalOpen(true);
  }, []);

  const openEdit = useCallback((row: EmpresaGrupo) => {
    setEditing(row);
    setNome(row.grupo_empresa);
    setFormError(null);
    setFormModalOpen(true);
  }, []);

  const closeFormModal = useCallback(() => {
    setFormModalOpen(false);
    setEditing(null);
    setNome("");
    setFormError(null);
  }, []);

  const closeFeedbackModal = useCallback(() => {
    setFeedbackModal(null);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = nome.trim();
    if (!trimmed) {
      setFormError("Informe o nome do grupo de empresas.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const res = await fetch(`/api/empresa-grupos/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grupo_empresa: trimmed }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(j.error ?? "Erro ao atualizar.");
        closeFormModal();
        setFeedbackModal({
          title: "Alterações salvas",
          message: `O grupo "${trimmed}" foi atualizado com sucesso.`,
        });
      } else {
        const res = await fetch("/api/empresa-grupos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grupo_empresa: trimmed }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(j.error ?? "Erro ao cadastrar.");
        closeFormModal();
        setFeedbackModal({
          title: "Cadastro concluído",
          message: `O grupo "${trimmed}" foi cadastrado com sucesso.`,
        });
      }
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function executarMudancaStatus() {
    if (!confirmStatus) return;
    const { row, acao } = confirmStatus;
    const ativar = acao === "ativar";

    setStatusAlterando(true);
    setListError(null);
    try {
      const res = await fetch(`/api/empresa-grupos/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: ativar }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setListError(
          j.error ?? (ativar ? "Erro ao ativar." : "Erro ao inativar."),
        );
        setConfirmStatus(null);
        return;
      }
      setConfirmStatus(null);
      setFeedbackModal(
        ativar
          ? {
              title: "Grupo ativado",
              message: `O grupo "${row.grupo_empresa}" foi ativado novamente e poderá ser usado em novos vínculos.`,
            }
          : {
              title: "Grupo inativado",
              message: `O grupo "${row.grupo_empresa}" foi inativado. Ele ficará indisponível para novos vínculos.`,
            },
      );
      router.refresh();
    } finally {
      setStatusAlterando(false);
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
        <div
          className="alert alert-warning alert-dismissible fade show"
          role="alert"
        >
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
          <h3 className="card-title mb-2 mb-sm-0">Grupos de empresas</h3>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={openCreate}
          >
            <i className="fas fa-plus mr-1" aria-hidden />
            Novo grupo
          </button>
        </div>
        <div className="card-body table-responsive p-0">
          <table className="table table-hover table-striped mb-0">
            <thead>
              <tr>
                <th style={{ width: "72px" }}>ID</th>
                <th>Nome do grupo</th>
                <th style={{ width: "180px" }}>Atualizado em</th>
                <th style={{ width: "100px" }}>Status</th>
                <th style={{ width: "260px" }} className="text-right">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    Nenhum grupo cadastrado.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.grupo_empresa}</td>
                    <td>{formatarData(row.data_atualizacao)}</td>
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
                        disabled={!row.ativo}
                        title={
                          row.ativo
                            ? "Editar"
                            : "Ative o grupo para editar o nome"
                        }
                      >
                        <i className="fas fa-edit" aria-hidden /> Editar
                      </button>
                      {row.ativo ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() =>
                            setConfirmStatus({ row, acao: "inativar" })
                          }
                          title="Inativar"
                        >
                          <i className="fas fa-ban" aria-hidden /> Inativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          onClick={() =>
                            setConfirmStatus({ row, acao: "ativar" })
                          }
                          title="Ativar novamente"
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

      {formModalOpen ? (
        <ModalBackdrop onBackdropClick={closeFormModal}>
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <form onSubmit={(e) => void handleSubmit(e)}>
                <div className="modal-header">
                  <h5 className="modal-title" id={formTitleId}>
                    {editing ? "Editar grupo" : "Novo grupo"}
                  </h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={closeFormModal}
                  >
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
                    <label htmlFor="grupo-empresa-nome">Nome do grupo</label>
                    <input
                      id="grupo-empresa-nome"
                      className="form-control"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={closeFormModal}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                  >
                    {saving ? "Salvando…" : "Salvar"}
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
            if (!statusAlterando) setConfirmStatus(null);
          }}
        >
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <div className="modal-header bg-light">
                <h5 className="modal-title" id={confirmTitleId}>
                  {confirmStatus.acao === "ativar"
                    ? "Confirmar ativação"
                    : "Confirmar inativação"}
                </h5>
                <button
                  type="button"
                  className="close"
                  aria-label="Fechar"
                  disabled={statusAlterando}
                  onClick={() => setConfirmStatus(null)}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  {confirmStatus.acao === "ativar" ? (
                    <>
                      Ativar o grupo{" "}
                      <strong>
                        &quot;{confirmStatus.row.grupo_empresa}&quot;
                      </strong>{" "}
                      novamente? Ele poderá ser usado em novos vínculos.
                    </>
                  ) : (
                    <>
                      Inativar o grupo{" "}
                      <strong>
                        &quot;{confirmStatus.row.grupo_empresa}&quot;
                      </strong>
                      ? Ele ficará indisponível para novos vínculos.
                    </>
                  )}
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={statusAlterando}
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
                  disabled={statusAlterando}
                  onClick={() => void executarMudancaStatus()}
                >
                  {statusAlterando
                    ? confirmStatus.acao === "ativar"
                      ? "Ativando…"
                      : "Inativando…"
                    : confirmStatus.acao === "ativar"
                      ? "Confirmar ativação"
                      : "Confirmar inativação"}
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {feedbackModal ? (
        <ModalBackdrop onBackdropClick={closeFeedbackModal}>
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header border-0 pb-0">
                <h5
                  className="modal-title text-success"
                  id={feedbackTitleId}
                >
                  <i className="fas fa-check-circle mr-2" aria-hidden />
                  {feedbackModal.title}
                </h5>
                <button
                  type="button"
                  className="close"
                  aria-label="Fechar"
                  onClick={closeFeedbackModal}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body pt-2">
                <p className="mb-0">{feedbackModal.message}</p>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={closeFeedbackModal}
                >
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
