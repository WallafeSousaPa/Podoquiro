"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";

type BandeiraRow = {
  id: number;
  codigo: string;
  nome_bandeira: string;
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
  bandeiras: BandeiraRow[];
  loadError?: string | null;
};

export function BandeirasClient({ bandeiras: bandeirasProp, loadError }: Props) {
  const router = useRouter();
  const modalTitleId = useId();
  const confirmTitleId = useId();

  const [rows, setRows] = useState<BandeiraRow[]>(bandeirasProp);
  useEffect(() => {
    setRows(bandeirasProp);
  }, [bandeirasProp]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BandeiraRow | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nomeBandeira, setNomeBandeira] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{
    row: BandeiraRow;
    acao: "ativar" | "inativar";
  } | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; message: string } | null>(
    null,
  );

  function resetForm() {
    setEditing(null);
    setCodigo("");
    setNomeBandeira("");
    setAtivo(true);
    setFormError(null);
  }

  function openCreate() {
    resetForm();
    setAtivo(true);
    setModalOpen(true);
  }

  function openEdit(row: BandeiraRow) {
    setEditing(row);
    setCodigo(row.codigo);
    setNomeBandeira(row.nome_bandeira);
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
    const codigoTrim = codigo.trim();
    const nomeTrim = nomeBandeira.trim();
    if (!codigoTrim) {
      setFormError("Informe o código da bandeira (2 dígitos).");
      return;
    }
    if (!nomeTrim) {
      setFormError("Informe o nome da bandeira.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        codigo: codigoTrim,
        nome_bandeira: nomeTrim,
        ativo,
      };
      const url = editing ? `/api/bandeiras/${editing.id}` : "/api/bandeiras";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar bandeira.");

      closeModal();
      setFeedback({
        title: editing ? "Bandeira atualizada" : "Bandeira cadastrada",
        message: editing
          ? `As alterações em "${nomeTrim}" foram salvas.`
          : `A bandeira "${nomeTrim}" foi cadastrada com sucesso.`,
      });
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar bandeira.");
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
      const res = await fetch(`/api/bandeiras/${confirmStatus.row.id}`, {
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
        title: novoAtivo ? "Bandeira ativada" : "Bandeira desativada",
        message: novoAtivo
          ? `"${confirmStatus.row.nome_bandeira}" foi ativada.`
          : `"${confirmStatus.row.nome_bandeira}" foi desativada.`,
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
          <h3 className="card-title mb-2 mb-sm-0">Bandeiras cadastradas</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
            <i className="fas fa-plus mr-1" aria-hidden /> Nova bandeira
          </button>
        </div>
        <div className="card-body table-responsive p-0">
          <table className="table table-hover table-striped mb-0">
            <thead>
              <tr>
                <th style={{ width: "70px" }}>ID</th>
                <th style={{ width: "90px" }}>Código</th>
                <th>Nome</th>
                <th style={{ width: "90px" }}>Status</th>
                <th style={{ width: "220px" }} className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    Nenhuma bandeira cadastrada.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.codigo}</td>
                    <td>{row.nome_bandeira}</td>
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
                    {editing ? "Editar bandeira" : "Nova bandeira"}
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
                    <label htmlFor="bandeira-codigo">Código (tBand)</label>
                    <input
                      id="bandeira-codigo"
                      className="form-control"
                      placeholder="Ex.: 01, 02, 99"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value)}
                      maxLength={2}
                      required
                    />
                    <small className="form-text text-muted">
                      Código de 2 dígitos usado na NFC-e (ex.: 01 Visa, 02 Mastercard, 99
                      Outros).
                    </small>
                  </div>

                  <div className="form-group">
                    <label htmlFor="bandeira-nome">Nome da bandeira</label>
                    <input
                      id="bandeira-nome"
                      className="form-control"
                      placeholder="Ex.: Visa, Mastercard, Elo"
                      value={nomeBandeira}
                      onChange={(e) => setNomeBandeira(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group mb-0">
                    <div className="custom-control custom-switch">
                      <input
                        type="checkbox"
                        className="custom-control-input"
                        id="bandeira-ativo"
                        checked={ativo}
                        onChange={(e) => setAtivo(e.target.checked)}
                      />
                      <label className="custom-control-label" htmlFor="bandeira-ativo">
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
                    ? `Ativar a bandeira "${confirmStatus.row.nome_bandeira}"?`
                    : `Desativar a bandeira "${confirmStatus.row.nome_bandeira}"?`}
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
                    confirmStatus.acao === "ativar" ? "btn btn-success" : "btn btn-danger"
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
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setFeedback(null)}
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
