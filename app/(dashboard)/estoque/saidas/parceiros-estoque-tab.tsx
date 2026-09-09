"use client";

import { formatarCnpjCpf } from "@/lib/estoque/parse-nfe-xml";
import { empresaCompartilhaParceirosPodoquiro } from "@/lib/estoque/empresas-parceiros-compartilhados";
import type { PapelParceiro, ParceiroEstoqueRow } from "@/lib/estoque/parceiro-campos";
import { useCallback, useEffect, useId, useState } from "react";
import { ModalCompradorEstoque } from "./modal-comprador-estoque";

const FORM_VAZIO = {
  nome: "",
  razao_social: "",
  fantasia: "",
  doc: "",
  ie: "",
  email: "",
  fone: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  municipio: "",
  uf: "",
  ativo: true,
  observacao: "",
};

type FormParceiro = typeof FORM_VAZIO;

function rowParaForm(row: ParceiroEstoqueRow): FormParceiro {
  return {
    nome: row.nome ?? "",
    razao_social: row.razao_social ?? "",
    fantasia: row.fantasia ?? "",
    doc: row.doc ?? "",
    ie: row.ie ?? "",
    email: row.email ?? "",
    fone: row.fone ?? "",
    cep: row.cep ?? "",
    endereco: row.endereco ?? "",
    numero: row.numero ?? "",
    complemento: row.complemento ?? "",
    bairro: row.bairro ?? "",
    municipio: row.municipio ?? "",
    uf: row.uf ?? "",
    ativo: row.ativo,
    observacao: row.observacao ?? "",
  };
}

type Props = {
  papel: PapelParceiro;
  empresaId: string;
  empresaNome?: string;
  disabled?: boolean;
};

export function ParceirosEstoqueTab({ papel, empresaId, empresaNome, disabled }: Props) {
  const titulo = papel === "fornecedor" ? "Fornecedores" : "Compradores";
  const formId = useId();
  const [lista, setLista] = useState<ParceiroEstoqueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormParceiro>(FORM_VAZIO);
  const [confirmExcluir, setConfirmExcluir] = useState<ParceiroEstoqueRow | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        papel,
        id_empresa: empresaId,
      });
      if (busca.trim()) qs.set("q", busca.trim());
      const res = await fetch(`/api/estoque/parceiros?${qs}`, { credentials: "include" });
      const j = (await res.json()) as { data?: ParceiroEstoqueRow[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível carregar.");
      setLista(j.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, [papel, empresaId, busca]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setFormAberto(true);
    setError(null);
  }

  function abrirEditar(row: ParceiroEstoqueRow) {
    setEditandoId(row.id);
    setForm(rowParaForm(row));
    setFormAberto(true);
    setError(null);
  }

  async function salvar(dados: FormParceiro = form) {
    setSalvando(true);
    setError(null);
    setSucesso(null);
    try {
      const url = editandoId
        ? `/api/estoque/parceiros/${editandoId}`
        : "/api/estoque/parceiros";
      const res = await fetch(url, {
        method: editandoId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          papel,
          id_empresa: Number(empresaId),
          ...dados,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível salvar.");
      setFormAberto(false);
      setSucesso(editandoId ? "Cadastro atualizado." : "Cadastro criado.");
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(row: ParceiroEstoqueRow) {
    setSalvando(true);
    setError(null);
    try {
      const res = await fetch(`/api/estoque/parceiros/${row.id}?papel=${papel}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível excluir.");
      setConfirmExcluir(null);
      setSucesso("Cadastro excluído.");
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir.");
    } finally {
      setSalvando(false);
    }
  }

  function setCampo<K extends keyof FormParceiro>(k: K, v: FormParceiro[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function salvarParceiro() {
    const doc = form.doc.replace(/\D/g, "");
    const payload = { ...form };
    if (doc.length > 11) {
      payload.nome =
        payload.fantasia.trim() || payload.razao_social.trim() || payload.nome.trim();
    }
    void salvar(payload);
  }

  return (
    <>
      <div className="card card-outline card-secondary">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center">
          <h3 className="card-title mb-2 mb-sm-0">{titulo}</h3>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={disabled || salvando}
            onClick={abrirNovo}
          >
            <i className="fas fa-plus mr-1" aria-hidden />
            Novo {papel === "fornecedor" ? "fornecedor" : "comprador"}
          </button>
        </div>
        <div className="card-body">
          {error && !formAberto ? (
            <div className="alert alert-danger py-2 small" role="alert">
              {error}
            </div>
          ) : null}
          {sucesso ? (
            <div className="alert alert-success py-2 small" role="alert">
              {sucesso}
            </div>
          ) : null}
          {empresaCompartilhaParceirosPodoquiro(empresaNome) ? (
            <p className="small text-muted mb-3">
              Cadastro compartilhado entre <strong>Podoquiro</strong> e{" "}
              <strong>Podoquiro Mercadorias</strong>. O que for incluído em uma aparece na outra.
            </p>
          ) : null}
          <div className="form-group mb-3" style={{ maxWidth: "22rem" }}>
            <label htmlFor={`${formId}-busca`}>Buscar</label>
            <input
              id={`${formId}-busca`}
              className="form-control"
              placeholder="Nome ou CPF/CNPJ"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
        <div className="card-body table-responsive p-0">
          <table className="table table-hover table-striped table-sm mb-0">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF/CNPJ</th>
                <th>Município</th>
                <th>Contato</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    Carregando…
                  </td>
                </tr>
              ) : lista.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    Nenhum cadastro nesta empresa.
                  </td>
                </tr>
              ) : (
                lista.map((row) => (
                  <tr key={row.id} className={row.ativo ? undefined : "text-muted"}>
                    <td>
                      <div>{row.nome}</div>
                      {row.fantasia || row.razao_social ? (
                        <div className="small text-muted">
                          {row.fantasia || row.razao_social}
                        </div>
                      ) : null}
                    </td>
                    <td className="small">{formatarCnpjCpf(row.doc, row.tipo_doc)}</td>
                    <td className="small">
                      {[row.municipio, row.uf].filter(Boolean).join("/") || "—"}
                    </td>
                    <td className="small">
                      {row.fone || row.email || "—"}
                    </td>
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
                        className="btn btn-outline-primary btn-sm mr-1"
                        disabled={disabled || salvando}
                        onClick={() => abrirEditar(row)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        disabled={disabled || salvando}
                        onClick={() => setConfirmExcluir(row)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formAberto ? (
        <ModalCompradorEstoque
          papel={papel}
          formId={`${formId}-parceiro`}
          editandoId={editandoId}
          form={form}
          salvando={salvando}
          error={error}
          onCampo={setCampo}
          onClose={() => setFormAberto(false)}
          onSave={salvarParceiro}
        />
      ) : null}

      {confirmExcluir ? (
        <>
          <div
            className="modal fade show"
            style={{ display: "block" }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-dialog" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Excluir cadastro</h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={() => setConfirmExcluir(null)}
                    disabled={salvando}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
                <div className="modal-body">
                  Excluir <strong>{confirmExcluir.nome}</strong>? Saídas já
                  registradas mantêm o destinatário em texto.
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setConfirmExcluir(null)}
                    disabled={salvando}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void excluir(confirmExcluir)}
                    disabled={salvando}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" role="presentation" />
        </>
      ) : null}
    </>
  );
}
