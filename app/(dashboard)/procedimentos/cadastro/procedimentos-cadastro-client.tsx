"use client";

import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { calcularValorTotalProcedimento } from "@/lib/procedimentos";

type ProcedimentoRaw = {
  id: number;
  procedimento: string;
  custo_base: string | number;
  margem_lucro: string | number;
  taxas_impostos: string | number;
  valor_total: string | number;
  ativo: boolean;
  ultima_atualizacao: string;
};

type ProcedimentoItem = {
  id: number;
  procedimento: string;
  custo_base: number;
  margem_lucro: number;
  taxas_impostos: number;
  valor_total: number;
  ativo: boolean;
  ultima_atualizacao: string;
};

function normalizeNum(v: string | number): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRaw(p: ProcedimentoRaw): ProcedimentoItem {
  return {
    id: p.id,
    procedimento: p.procedimento,
    custo_base: normalizeNum(p.custo_base),
    margem_lucro: normalizeNum(p.margem_lucro),
    taxas_impostos: normalizeNum(p.taxas_impostos),
    valor_total: normalizeNum(p.valor_total),
    ativo: p.ativo,
    ultima_atualizacao: p.ultima_atualizacao,
  };
}

const moneyFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const pctFmt = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
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
  procedimentos: ProcedimentoRaw[];
  loadError?: string | null;
};

export function ProcedimentosCadastroClient({
  procedimentos: procedimentosProp,
  loadError,
}: Props) {
  const router = useRouter();
  const modalTitleId = useId();
  const confirmTitleId = useId();

  const [rows, setRows] = useState<ProcedimentoItem[]>(() =>
    procedimentosProp.map(mapRaw),
  );
  useEffect(() => {
    setRows(procedimentosProp.map(mapRaw));
  }, [procedimentosProp]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProcedimentoItem | null>(null);
  const [nome, setNome] = useState("");
  const [custoBase, setCustoBase] = useState("");
  const [margem, setMargem] = useState("");
  const [taxas, setTaxas] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{
    row: ProcedimentoItem;
    acao: "ativar" | "inativar";
  } | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; message: string } | null>(
    null,
  );

  const previewTotal = useMemo(() => {
    const c = Number(String(custoBase).trim().replace(",", "."));
    const m = Number(String(margem).trim().replace(",", "."));
    const t = Number(String(taxas).trim().replace(",", "."));
    if (!Number.isFinite(c) || c < 0) return null;
    const mp = Number.isFinite(m) && m >= 0 ? m : 0;
    const tp = Number.isFinite(t) && t >= 0 ? t : 0;
    return calcularValorTotalProcedimento(c, mp, tp);
  }, [custoBase, margem, taxas]);

  function resetForm() {
    setEditing(null);
    setNome("");
    setCustoBase("");
    setMargem("");
    setTaxas("");
    setAtivo(false);
    setFormError(null);
  }

  function openCreate() {
    resetForm();
    setMargem("0");
    setTaxas("0");
    setAtivo(true);
    setModalOpen(true);
  }

  function openEdit(row: ProcedimentoItem) {
    setEditing(row);
    setNome(row.procedimento);
    setCustoBase(String(row.custo_base));
    setMargem(String(row.margem_lucro));
    setTaxas(String(row.taxas_impostos));
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
      setFormError("Informe o nome do procedimento.");
      return;
    }

    const custoStr = String(custoBase).trim().replace(",", ".");
    const margemStr = String(margem).trim().replace(",", ".");
    const taxasStr = String(taxas).trim().replace(",", ".");

    const custo = Number(custoStr);
    if (!Number.isFinite(custo) || custo < 0) {
      setFormError("Informe um custo base válido (≥ 0).");
      return;
    }
    const margemN = margemStr === "" ? 0 : Number(margemStr);
    const taxasN = taxasStr === "" ? 0 : Number(taxasStr);
    if (!Number.isFinite(margemN) || margemN < 0) {
      setFormError("Margem de lucro inválida (≥ 0).");
      return;
    }
    if (!Number.isFinite(taxasN) || taxasN < 0) {
      setFormError("Taxas/impostos inválidos (≥ 0).");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        procedimento: nomeTrim,
        custo_base: custo,
        margem_lucro: margemN,
        taxas_impostos: taxasN,
        ativo,
      };
      const url = editing ? `/api/procedimentos/${editing.id}` : "/api/procedimentos";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar procedimento.");

      closeModal();
      setFeedback({
        title: editing ? "Procedimento atualizado" : "Procedimento cadastrado",
        message: editing
          ? `As alterações em "${nomeTrim}" foram salvas.`
          : `O procedimento "${nomeTrim}" foi cadastrado com sucesso.`,
      });
      router.refresh();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Erro ao salvar procedimento.",
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
      const res = await fetch(`/api/procedimentos/${confirmStatus.row.id}`, {
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
        title: novoAtivo ? "Procedimento ativado" : "Procedimento inativado",
        message: novoAtivo
          ? `"${confirmStatus.row.procedimento}" foi ativado.`
          : `"${confirmStatus.row.procedimento}" foi inativado.`,
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
          <h3 className="card-title mb-2 mb-sm-0">Procedimentos</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
            <i className="fas fa-plus mr-1" aria-hidden /> Novo procedimento
          </button>
        </div>
        <div className="card-body table-responsive p-0">
          <table className="table table-hover table-striped mb-0">
            <thead>
              <tr>
                <th style={{ width: "70px" }}>ID</th>
                <th>Procedimento</th>
                <th>Custo base</th>
                <th>Margem (%)</th>
                <th>Taxas/impostos (%)</th>
                <th>Valor total</th>
                <th style={{ width: "90px" }}>Status</th>
                <th>Última atualização</th>
                <th style={{ width: "220px" }} className="text-right">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-muted py-4">
                    Nenhum procedimento cadastrado.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.procedimento}</td>
                    <td>{moneyFmt.format(row.custo_base)}</td>
                    <td>{pctFmt.format(row.margem_lucro)}%</td>
                    <td>{pctFmt.format(row.taxas_impostos)}%</td>
                    <td>{moneyFmt.format(row.valor_total)}</td>
                    <td>
                      {row.ativo ? (
                        <span className="badge badge-success">Ativo</span>
                      ) : (
                        <span className="badge badge-secondary">Inativo</span>
                      )}
                    </td>
                    <td className="text-nowrap small">{formatDateTime(row.ultima_atualizacao)}</td>
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
                    {editing ? "Editar procedimento" : "Novo procedimento"}
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
                    <label htmlFor="proc-nome">Nome do procedimento</label>
                    <input
                      id="proc-nome"
                      className="form-control"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group col-md-4">
                      <label htmlFor="proc-custo">Custo base (R$)</label>
                      <input
                        id="proc-custo"
                        type="text"
                        inputMode="decimal"
                        className="form-control"
                        value={custoBase}
                        onChange={(e) => setCustoBase(e.target.value)}
                        placeholder="0,00"
                        required
                      />
                    </div>
                    <div className="form-group col-md-4">
                      <label htmlFor="proc-margem">Margem de lucro (%)</label>
                      <input
                        id="proc-margem"
                        type="text"
                        inputMode="decimal"
                        className="form-control"
                        value={margem}
                        onChange={(e) => setMargem(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="form-group col-md-4">
                      <label htmlFor="proc-taxas">Taxas e impostos (%)</label>
                      <input
                        id="proc-taxas"
                        type="text"
                        inputMode="decimal"
                        className="form-control"
                        value={taxas}
                        onChange={(e) => setTaxas(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <div className="custom-control custom-switch">
                      <input
                        type="checkbox"
                        className="custom-control-input"
                        id="proc-ativo"
                        checked={ativo}
                        onChange={(e) => setAtivo(e.target.checked)}
                      />
                      <label className="custom-control-label" htmlFor="proc-ativo">
                        Ativo
                      </label>
                    </div>
                  </div>

                  <p className="text-muted small mb-0">
                    Valor total (prévia):{" "}
                    <strong>
                      {previewTotal !== null ? moneyFmt.format(previewTotal) : "—"}
                    </strong>
                    <span className="d-block mt-1">
                      Cálculo: custo base × (1 + margem/100) × (1 + taxas/100).
                    </span>
                  </p>
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
                    ? `Ativar o procedimento "${confirmStatus.row.procedimento}"?`
                    : `Inativar o procedimento "${confirmStatus.row.procedimento}"?`}
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
