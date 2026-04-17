"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";

type GrupoItem = {
  id: number;
  grupo_empresa: string;
};

type EmpresaItem = {
  id: number;
  nome_fantasia: string;
  razao_social: string;
  cnpj_cpf: string;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  id_empresa_grupo: number;
  ativo: boolean;
  grupo_empresa: string | null;
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
  empresas: EmpresaItem[];
  loadError?: string | null;
};

export function EmpresasCadastroClient({ grupos, empresas, loadError }: Props) {
  const router = useRouter();
  const modalTitleId = useId();
  const confirmTitleId = useId();

  const [rows, setRows] = useState(empresas);
  useEffect(() => {
    setRows(empresas);
  }, [empresas]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmpresaItem | null>(null);
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpjCpf, setCnpjCpf] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [idGrupo, setIdGrupo] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{
    row: EmpresaItem;
    acao: "ativar" | "inativar";
  } | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; message: string } | null>(
    null,
  );

  function resetForm() {
    setEditing(null);
    setNomeFantasia("");
    setRazaoSocial("");
    setCnpjCpf("");
    setCep("");
    setEndereco("");
    setNumero("");
    setComplemento("");
    setBairro("");
    setCidade("");
    setEstado("");
    setIdGrupo("");
    setFormError(null);
  }

  function openCreate() {
    resetForm();
    setModalOpen(true);
  }

  function openEdit(row: EmpresaItem) {
    setEditing(row);
    setNomeFantasia(row.nome_fantasia);
    setRazaoSocial(row.razao_social);
    setCnpjCpf(row.cnpj_cpf);
    setCep(row.cep ?? "");
    setEndereco(row.endereco ?? "");
    setNumero(row.numero ?? "");
    setComplemento(row.complemento ?? "");
    setBairro(row.bairro ?? "");
    setCidade(row.cidade ?? "");
    setEstado(row.estado ?? "");
    setIdGrupo(String(row.id_empresa_grupo));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    resetForm();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const nomeFantasiaTrim = nomeFantasia.trim();
    const razaoSocialTrim = razaoSocial.trim();
    const cnpjCpfTrim = cnpjCpf.trim();
    if (!nomeFantasiaTrim) {
      setFormError("Informe o nome fantasia.");
      return;
    }
    if (!razaoSocialTrim) {
      setFormError("Informe a razão social.");
      return;
    }
    if (!cnpjCpfTrim) {
      setFormError("Informe o CPF/CNPJ.");
      return;
    }
    if (!idGrupo) {
      setFormError("Selecione o grupo de empresas.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        nome_fantasia: nomeFantasiaTrim,
        razao_social: razaoSocialTrim,
        cnpj_cpf: cnpjCpfTrim,
        cep: cep.trim() || null,
        endereco: endereco.trim() || null,
        numero: numero.trim() || null,
        complemento: complemento.trim() || null,
        bairro: bairro.trim() || null,
        cidade: cidade.trim() || null,
        estado: estado.trim() || null,
        id_empresa_grupo: Number(idGrupo),
      };

      const url = editing ? `/api/empresas/${editing.id}` : "/api/empresas";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar empresa.");

      closeModal();
      setFeedback({
        title: editing ? "Empresa atualizada" : "Empresa cadastrada",
        message: editing
          ? `As alterações da empresa "${nomeFantasiaTrim}" foram salvas.`
          : `A empresa "${nomeFantasiaTrim}" foi cadastrada com sucesso.`,
      });
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar empresa.");
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
      const res = await fetch(`/api/empresas/${confirmStatus.row.id}`, {
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
        title: ativo ? "Empresa ativada" : "Empresa inativada",
        message: ativo
          ? `A empresa "${confirmStatus.row.nome_fantasia}" foi ativada.`
          : `A empresa "${confirmStatus.row.nome_fantasia}" foi inativada.`,
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
          <h3 className="card-title mb-2 mb-sm-0">Empresas cadastradas</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
            <i className="fas fa-building mr-1" aria-hidden /> Nova empresa
          </button>
        </div>
        <div className="card-body table-responsive p-0">
          <table className="table table-hover table-striped mb-0">
            <thead>
              <tr>
                <th style={{ width: "70px" }}>ID</th>
                <th>Nome fantasia</th>
                <th>Razão social</th>
                <th>CPF/CNPJ</th>
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
                  <td colSpan={7} className="text-center text-muted py-4">
                    Nenhuma empresa cadastrada.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.nome_fantasia}</td>
                    <td>{row.razao_social}</td>
                    <td>{row.cnpj_cpf}</td>
                    <td>{row.grupo_empresa || "-"}</td>
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
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content">
              <form onSubmit={(e) => void submit(e)}>
                <div className="modal-header">
                  <h5 className="modal-title" id={modalTitleId}>
                    {editing ? "Editar empresa" : "Nova empresa"}
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

                  <div className="form-row">
                    <div className="form-group col-md-6">
                      <label htmlFor="empresa-nome-fantasia">Nome fantasia</label>
                      <input
                        id="empresa-nome-fantasia"
                        className="form-control"
                        value={nomeFantasia}
                        onChange={(e) => setNomeFantasia(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group col-md-6">
                      <label htmlFor="empresa-razao-social">Razão social</label>
                      <input
                        id="empresa-razao-social"
                        className="form-control"
                        value={razaoSocial}
                        onChange={(e) => setRazaoSocial(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group col-md-4">
                      <label htmlFor="empresa-cnpj-cpf">CPF/CNPJ</label>
                      <input
                        id="empresa-cnpj-cpf"
                        className="form-control"
                        value={cnpjCpf}
                        onChange={(e) => setCnpjCpf(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group col-md-4">
                      <label htmlFor="empresa-grupo">Grupo de empresas</label>
                      <select
                        id="empresa-grupo"
                        className="form-control"
                        value={idGrupo}
                        onChange={(e) => setIdGrupo(e.target.value)}
                        required
                      >
                        <option value="">Selecione...</option>
                        {grupos.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.grupo_empresa}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group col-md-4">
                      <label htmlFor="empresa-cep">CEP</label>
                      <input
                        id="empresa-cep"
                        className="form-control"
                        value={cep}
                        onChange={(e) => setCep(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group col-md-6">
                      <label htmlFor="empresa-endereco">Endereço</label>
                      <input
                        id="empresa-endereco"
                        className="form-control"
                        value={endereco}
                        onChange={(e) => setEndereco(e.target.value)}
                      />
                    </div>
                    <div className="form-group col-md-2">
                      <label htmlFor="empresa-numero">Número</label>
                      <input
                        id="empresa-numero"
                        className="form-control"
                        value={numero}
                        onChange={(e) => setNumero(e.target.value)}
                      />
                    </div>
                    <div className="form-group col-md-4">
                      <label htmlFor="empresa-complemento">Complemento</label>
                      <input
                        id="empresa-complemento"
                        className="form-control"
                        value={complemento}
                        onChange={(e) => setComplemento(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-row mb-0">
                    <div className="form-group col-md-4">
                      <label htmlFor="empresa-bairro">Bairro</label>
                      <input
                        id="empresa-bairro"
                        className="form-control"
                        value={bairro}
                        onChange={(e) => setBairro(e.target.value)}
                      />
                    </div>
                    <div className="form-group col-md-4">
                      <label htmlFor="empresa-cidade">Cidade</label>
                      <input
                        id="empresa-cidade"
                        className="form-control"
                        value={cidade}
                        onChange={(e) => setCidade(e.target.value)}
                      />
                    </div>
                    <div className="form-group col-md-4">
                      <label htmlFor="empresa-estado">Estado</label>
                      <input
                        id="empresa-estado"
                        className="form-control"
                        value={estado}
                        onChange={(e) => setEstado(e.target.value)}
                      />
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
                    ? `Ativar a empresa "${confirmStatus.row.nome_fantasia}"?`
                    : `Inativar a empresa "${confirmStatus.row.nome_fantasia}"?`}
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
