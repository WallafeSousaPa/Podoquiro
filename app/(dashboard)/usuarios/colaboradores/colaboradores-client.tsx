"use client";

import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";

type UsuarioOpt = {
  id: number;
  usuario: string;
  nome: string;
};

type ProcOpt = {
  id: number;
  procedimento: string;
  valor_total: number;
  ativo: boolean;
};

type VinculoRow = {
  id: number;
  id_procedimento: number;
  comissao_porcentagem: number | null;
  ultima_atualizacao: string;
  procedimento_nome: string | null;
  procedimento_valor_total: number | null;
  procedimento_ativo: boolean | null;
};

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
  usuarios: UsuarioOpt[];
  procedimentosEmpresa: ProcOpt[];
  loadError?: string | null;
};

export function ColaboradoresClient({
  usuarios,
  procedimentosEmpresa,
  loadError,
}: Props) {
  const router = useRouter();
  const feedbackTitleId = useId();

  const [idUsuarioSel, setIdUsuarioSel] = useState("");
  const [vinculos, setVinculos] = useState<VinculoRow[]>([]);
  const [loadingVinculos, setLoadingVinculos] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [novoProcId, setNovoProcId] = useState("");
  const [novaComissao, setNovaComissao] = useState("");
  const [savingAdd, setSavingAdd] = useState(false);

  const [editRow, setEditRow] = useState<VinculoRow | null>(null);
  const [editComissao, setEditComissao] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [remover, setRemover] = useState<VinculoRow | null>(null);
  const [removendo, setRemovendo] = useState(false);

  const [feedback, setFeedback] = useState<{ title: string; message: string } | null>(
    null,
  );

  const carregarVinculos = useCallback(async (idUs: number) => {
    setLoadingVinculos(true);
    setListError(null);
    try {
      const res = await fetch(
        `/api/colaboradores-procedimentos?id_usuario=${encodeURIComponent(String(idUs))}`,
      );
      const j = (await res.json()) as { data?: VinculoRow[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar vínculos.");
      setVinculos(j.data ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Erro ao carregar.");
      setVinculos([]);
    } finally {
      setLoadingVinculos(false);
    }
  }, []);

  useEffect(() => {
    const id = Number(idUsuarioSel);
    if (!Number.isFinite(id) || id <= 0) {
      setVinculos([]);
      return;
    }
    void carregarVinculos(id);
  }, [idUsuarioSel, carregarVinculos]);

  const procsDisponiveisParaAdd = procedimentosEmpresa.filter(
    (p) =>
      p.ativo &&
      !vinculos.some((v) => v.id_procedimento === p.id),
  );

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    const idUs = Number(idUsuarioSel);
    const idProc = Number(novoProcId);
    if (!Number.isFinite(idUs) || idUs <= 0) {
      setListError("Selecione um colaborador.");
      return;
    }
    if (!Number.isFinite(idProc) || idProc <= 0) {
      setListError("Selecione um procedimento.");
      return;
    }
    let comissao: number | null = null;
    const t = novaComissao.trim().replace(",", ".");
    if (t !== "") {
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        setListError("Comissão deve ser entre 0 e 100% ou vazio.");
        return;
      }
      comissao = n;
    }

    setSavingAdd(true);
    setListError(null);
    try {
      const res = await fetch("/api/colaboradores-procedimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_usuario: idUs,
          id_procedimento: idProc,
          comissao_porcentagem: comissao,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao vincular.");
      setNovoProcId("");
      setNovaComissao("");
      setFeedback({
        title: "Procedimento vinculado",
        message: "O colaborador pode executar este procedimento na agenda.",
      });
      router.refresh();
      await carregarVinculos(idUs);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Erro ao vincular.");
    } finally {
      setSavingAdd(false);
    }
  }

  async function salvarEdicaoComissao(e: FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    let comissao: number | null = null;
    const t = editComissao.trim().replace(",", ".");
    if (t !== "") {
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        setListError("Comissão deve ser entre 0 e 100% ou vazio.");
        return;
      }
      comissao = n;
    }
    setSavingEdit(true);
    setListError(null);
    try {
      const res = await fetch(`/api/colaboradores-procedimentos/${editRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comissao_porcentagem: comissao }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setEditRow(null);
      setFeedback({ title: "Comissão atualizada", message: "Alteração salva." });
      router.refresh();
      const idUs = Number(idUsuarioSel);
      if (Number.isFinite(idUs)) await carregarVinculos(idUs);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function executarRemover() {
    if (!remover) return;
    setRemovendo(true);
    setListError(null);
    try {
      const res = await fetch(`/api/colaboradores-procedimentos/${remover.id}`, {
        method: "DELETE",
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao remover.");
      setRemover(null);
      setFeedback({
        title: "Vínculo removido",
        message: "O procedimento não está mais liberado para este colaborador.",
      });
      router.refresh();
      const idUs = Number(idUsuarioSel);
      if (Number.isFinite(idUs)) await carregarVinculos(idUs);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Erro ao remover.");
    } finally {
      setRemovendo(false);
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

      <div className="card card-outline card-primary mb-3">
        <div className="card-body">
          <div className="form-group mb-0">
            <label htmlFor="colab-usuario">Colaborador</label>
            <select
              id="colab-usuario"
              className="form-control"
              value={idUsuarioSel}
              onChange={(e) => setIdUsuarioSel(e.target.value)}
            >
              <option value="">Selecione um usuário da empresa…</option>
              {usuarios.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.nome} ({u.usuario})
                </option>
              ))}
            </select>
            <small className="form-text text-muted">
              Apenas usuários da empresa atual. Vincule os procedimentos que cada um pode
              executar na agenda.
            </small>
          </div>
        </div>
      </div>

      {idUsuarioSel ? (
        <div className="card card-outline card-secondary">
          <div className="card-header d-flex flex-wrap justify-content-between align-items-center">
            <h3 className="card-title mb-0">Procedimentos liberados</h3>
            {loadingVinculos ? (
              <span className="text-muted small">Carregando…</span>
            ) : null}
          </div>
          <div className="card-body">
            <form
              className="border rounded p-3 mb-4 bg-light"
              onSubmit={(e) => void adicionar(e)}
            >
              <strong className="d-block mb-2">Incluir procedimento</strong>
              <div className="form-row">
                <div className="form-group col-md-5">
                  <label className="small">Procedimento</label>
                  <select
                    className="form-control"
                    value={novoProcId}
                    onChange={(e) => setNovoProcId(e.target.value)}
                    required
                  >
                    <option value="">Selecione…</option>
                    {procsDisponiveisParaAdd.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.procedimento}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group col-md-3">
                  <label className="small">Comissão (%)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Opcional"
                    value={novaComissao}
                    onChange={(e) => setNovaComissao(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div className="form-group col-md-4 d-flex align-items-end">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingAdd || procsDisponiveisParaAdd.length === 0}
                  >
                    {savingAdd ? "Salvando…" : "Adicionar"}
                  </button>
                </div>
              </div>
              {procsDisponiveisParaAdd.length === 0 ? (
                <p className="text-muted small mb-0">
                  Não há procedimentos ativos disponíveis para novos vínculos (todos já
                  foram adicionados ou inativos no cadastro).
                </p>
              ) : null}
            </form>

            <div className="table-responsive">
              <table className="table table-hover table-striped table-sm mb-0">
                <thead>
                  <tr>
                    <th>Procedimento</th>
                    <th style={{ width: "120px" }}>Valor (cadastro)</th>
                    <th style={{ width: "110px" }}>Comissão %</th>
                    <th style={{ width: "160px" }}>Atualizado</th>
                    <th style={{ width: "140px" }} className="text-right">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vinculos.length === 0 && !loadingVinculos ? (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        Nenhum procedimento vinculado. O colaborador não verá opções na
                        agenda até incluir ao menos um.
                      </td>
                    </tr>
                  ) : (
                    vinculos.map((v) => (
                      <tr key={v.id}>
                        <td>
                          {v.procedimento_nome ?? `#${v.id_procedimento}`}
                          {v.procedimento_ativo === false ? (
                            <span className="badge badge-warning ml-1">Inativo</span>
                          ) : null}
                        </td>
                        <td className="text-nowrap">
                          {v.procedimento_valor_total != null
                            ? v.procedimento_valor_total.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })
                            : "—"}
                        </td>
                        <td>
                          {v.comissao_porcentagem != null
                            ? `${v.comissao_porcentagem}%`
                            : "—"}
                        </td>
                        <td className="small text-muted">
                          {formatarData(v.ultima_atualizacao)}
                        </td>
                        <td className="text-right text-nowrap">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary mr-1"
                            onClick={() => {
                              setEditRow(v);
                              setEditComissao(
                                v.comissao_porcentagem != null
                                  ? String(v.comissao_porcentagem)
                                  : "",
                              );
                            }}
                          >
                            Editar %
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => setRemover(v)}
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {editRow ? (
        <ModalBackdrop onBackdropClick={() => !savingEdit && setEditRow(null)}>
          <div className="modal-dialog" role="document">
            <form
              className="modal-content"
              onSubmit={(e) => void salvarEdicaoComissao(e)}
            >
              <div className="modal-header">
                <h5 className="modal-title">Comissão</h5>
                <button
                  type="button"
                  className="close"
                  onClick={() => setEditRow(null)}
                  disabled={savingEdit}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="small text-muted mb-2">
                  {editRow.procedimento_nome ?? `Procedimento #${editRow.id_procedimento}`}
                </p>
                <div className="form-group mb-0">
                  <label htmlFor="colab-comissao-edit">Comissão (%)</label>
                  <input
                    id="colab-comissao-edit"
                    className="form-control"
                    value={editComissao}
                    onChange={(e) => setEditComissao(e.target.value)}
                    placeholder="Deixe em branco para não informar"
                    inputMode="decimal"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditRow(null)}
                  disabled={savingEdit}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                  {savingEdit ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      ) : null}

      {remover ? (
        <ModalBackdrop onBackdropClick={() => !removendo && setRemover(null)}>
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <div className="modal-header bg-light">
                <h5 className="modal-title">Remover vínculo</h5>
                <button
                  type="button"
                  className="close"
                  onClick={() => setRemover(null)}
                  disabled={removendo}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  Remover{" "}
                  <strong>{remover.procedimento_nome ?? `#${remover.id_procedimento}`}</strong>{" "}
                  deste colaborador?
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRemover(null)}
                  disabled={removendo}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={removendo}
                  onClick={() => void executarRemover()}
                >
                  {removendo ? "Removendo…" : "Remover"}
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
                <h5
                  className="modal-title text-success"
                  id={feedbackTitleId}
                >
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
