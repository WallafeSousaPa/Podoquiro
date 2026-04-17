"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";

type GrupoItem = {
  id: number;
  grupo_usuarios: string;
};

type UsuarioItem = {
  id: number;
  usuario: string;
  email: string | null;
  ativo: boolean;
  id_grupo_usuarios: number;
  grupo_usuarios: string | null;
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
  grupos: GrupoItem[];
  usuarios: UsuarioItem[];
  loadError?: string | null;
};

export function UsuariosCadastroClient({ grupos, usuarios, loadError }: Props) {
  const router = useRouter();
  const modalTitleId = useId();
  const confirmTitleId = useId();

  const [rows, setRows] = useState(usuarios);
  useEffect(() => {
    setRows(usuarios);
  }, [usuarios]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UsuarioItem | null>(null);
  const [usuario, setUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [idGrupo, setIdGrupo] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{
    row: UsuarioItem;
    acao: "ativar" | "inativar";
  } | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; message: string } | null>(
    null,
  );

  function resetForm() {
    setEditing(null);
    setUsuario("");
    setEmail("");
    setSenha("");
    setIdGrupo("");
    setFormError(null);
  }

  function openCreate() {
    resetForm();
    setModalOpen(true);
  }

  function openEdit(row: UsuarioItem) {
    setEditing(row);
    setUsuario(row.usuario);
    setEmail(row.email ?? "");
    setSenha("");
    setIdGrupo(String(row.id_grupo_usuarios));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    resetForm();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const usuarioTrim = usuario.trim();
    if (!usuarioTrim) {
      setFormError("Informe o usuário.");
      return;
    }
    if (!idGrupo) {
      setFormError("Selecione o grupo de usuários.");
      return;
    }
    if (!editing && !senha.trim()) {
      setFormError("Informe a senha.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        usuario: usuarioTrim,
        email: email.trim() || null,
        id_grupo_usuarios: Number(idGrupo),
      };
      if (senha.trim()) payload.senha = senha.trim();

      const url = editing ? `/api/usuarios/${editing.id}` : "/api/usuarios";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar usuário.");

      closeModal();
      setFeedback({
        title: editing ? "Usuário atualizado" : "Usuário cadastrado",
        message: editing
          ? `As alterações do usuário "${usuarioTrim}" foram salvas.`
          : `O usuário "${usuarioTrim}" foi cadastrado com sucesso.`,
      });
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmarMudancaStatus() {
    if (!confirmStatus) return;
    setChangingStatus(true);
    setListError(null);
    try {
      const ativo = confirmStatus.acao === "ativar";
      const res = await fetch(`/api/usuarios/${confirmStatus.row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setListError(json.error ?? "Erro ao atualizar status.");
        setConfirmStatus(null);
        return;
      }
      setFeedback({
        title: ativo ? "Usuário ativado" : "Usuário inativado",
        message: ativo
          ? `O usuário "${confirmStatus.row.usuario}" foi ativado.`
          : `O usuário "${confirmStatus.row.usuario}" foi inativado.`,
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
          <h3 className="card-title mb-2 mb-sm-0">Usuários cadastrados</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
            <i className="fas fa-user-plus mr-1" aria-hidden /> Novo usuário
          </button>
        </div>
        <div className="card-body table-responsive p-0">
          <table className="table table-hover table-striped mb-0">
            <thead>
              <tr>
                <th style={{ width: "70px" }}>ID</th>
                <th>Usuário</th>
                <th>E-mail</th>
                <th>Grupo</th>
                <th style={{ width: "90px" }}>Status</th>
                <th style={{ width: "260px" }} className="text-right">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.usuario}</td>
                    <td>{row.email || "-"}</td>
                    <td>{row.grupo_usuarios || "-"}</td>
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
                          <i className="fas fa-ban" aria-hidden /> Inativar
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
                    {editing ? "Editar usuário" : "Novo usuário"}
                  </h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={closeModal}
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
                    <label htmlFor="usuario-nome">Usuário</label>
                    <input
                      id="usuario-nome"
                      className="form-control"
                      value={usuario}
                      onChange={(e) => setUsuario(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="usuario-email">E-mail</label>
                    <input
                      id="usuario-email"
                      className="form-control"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="usuario-grupo">Grupo de usuários</label>
                    <select
                      id="usuario-grupo"
                      className="form-control"
                      value={idGrupo}
                      onChange={(e) => setIdGrupo(e.target.value)}
                      required
                    >
                      <option value="">Selecione...</option>
                      {grupos.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.grupo_usuarios}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group mb-0">
                    <label htmlFor="usuario-senha">
                      Senha {editing ? "(preencha só para alterar)" : ""}
                    </label>
                    <input
                      id="usuario-senha"
                      className="form-control"
                      type="password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      required={!editing}
                    />
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
                    : "Confirmar inativação"}
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
                    ? `Ativar o usuário "${confirmStatus.row.usuario}"?`
                    : `Inativar o usuário "${confirmStatus.row.usuario}"?`}
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
                <button
                  type="button"
                  className="close"
                  aria-label="Fechar"
                  onClick={() => setFeedback(null)}
                >
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
