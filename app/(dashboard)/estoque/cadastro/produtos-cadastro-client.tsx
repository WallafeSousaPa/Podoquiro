"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";

export type EmpresaListaItem = {
  id: number;
  nome_fantasia: string | null;
};

export type ProdutoRow = {
  id: string;
  id_empresa?: number;
  sku: string | null;
  barcode: string | null;
  produto: string;
  descricao: string | null;
  un_medida: string;
  preco: number;
  qtd_estoque: number;
  desconto_padrao: number;
  preco_venda: number | null;
  ncm: string;
  cest: string | null;
  origem: number;
  csosn: string;
  cfop: string;
  pis_cst: string | null;
  cofins_cst: string | null;
  ativo: boolean;
  servico: boolean;
  id_procedimento?: number | null;
  created_at?: string;
  updated_at?: string;
};

const ORIGENS_ICMS: { value: number; label: string }[] = [
  { value: 0, label: "0 — Nacional" },
  { value: 1, label: "1 — Estrangeira — Importação direta" },
  { value: 2, label: "2 — Estrangeira — Adquirida no mercado interno" },
  { value: 3, label: "3 — Nacional com mais de 40% de conteúdo estrangeiro" },
  { value: 4, label: "4 — Nacional conforme processos produtivos" },
  { value: 5, label: "5 — Nacional com menos de 40% de conteúdo estrangeiro" },
  { value: 6, label: "6 — Estrangeira — Importação direta sem similar nacional" },
  { value: 7, label: "7 — Estrangeira — Mercado interno sem similar nacional" },
  { value: 8, label: "8 — Nacional com conteúdo de importação superior a 70%" },
];

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

function defaultForm() {
  return {
    produto: "",
    descricao: "",
    un_medida: "UN",
    preco: 0,
    qtd_estoque: 0,
    desconto_padrao: 0,
    preco_venda: null as number | null,
    ncm: "",
    cest: "",
    origem: 0,
    csosn: "102",
    cfop: "5102",
    pis_cst: "07",
    cofins_cst: "07",
    ativo: true,
    servico: false,
  };
}

type FormState = ReturnType<typeof defaultForm>;

type Props = {
  produtos: ProdutoRow[];
  empresas: EmpresaListaItem[];
  empresaIdPadrao: number;
  loadError?: string | null;
};

function nomeEmpresaLabel(empresas: EmpresaListaItem[], id: number) {
  const e = empresas.find((x) => x.id === id);
  const n = e?.nome_fantasia?.trim();
  return n || `Empresa #${id}`;
}

export function ProdutosCadastroClient({
  produtos: produtosProp,
  empresas,
  empresaIdPadrao,
  loadError,
}: Props) {
  const modalTitleId = useId();
  const confirmTitleId = useId();

  const [rows, setRows] = useState<ProdutoRow[]>(produtosProp);
  useEffect(() => {
    setRows(produtosProp);
  }, [produtosProp]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProdutoRow | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{
    row: ProdutoRow;
    acao: "ativar" | "inativar";
  } | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; message: string } | null>(
    null,
  );

  const [filtroEmpresaId, setFiltroEmpresaId] = useState(() =>
    String(empresaIdPadrao),
  );
  const [filtroProduto, setFiltroProduto] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"" | "servico" | "mercadoria">("");
  const [filtroStatus, setFiltroStatus] = useState<"" | "ativo" | "inativo">("");
  const [filtroEstoqueOp, setFiltroEstoqueOp] = useState<"" | "gt" | "lt" | "eq">(
    "",
  );
  const [filtroEstoqueValor, setFiltroEstoqueValor] = useState("");
  const [filtrosCarregando, setFiltrosCarregando] = useState(false);

  useEffect(() => {
    setFiltroEmpresaId(String(empresaIdPadrao));
  }, [empresaIdPadrao]);

  const montarQueryProdutos = useCallback(() => {
    const p = new URLSearchParams();
    p.set("id_empresa", filtroEmpresaId);
    const nome = filtroProduto.trim();
    if (nome) p.set("produto", nome);
    if (filtroTipo) p.set("tipo", filtroTipo);
    if (filtroStatus) p.set("status", filtroStatus);
    if (filtroEstoqueOp && filtroEstoqueValor.trim() !== "") {
      p.set("estoque_op", filtroEstoqueOp);
      p.set("estoque_val", filtroEstoqueValor.trim());
    }
    return p.toString();
  }, [
    filtroEmpresaId,
    filtroProduto,
    filtroTipo,
    filtroStatus,
    filtroEstoqueOp,
    filtroEstoqueValor,
  ]);

  const refetchLista = useCallback(async () => {
    setFiltrosCarregando(true);
    setListError(null);
    try {
      const qs = montarQueryProdutos();
      const res = await fetch(`/api/produtos?${qs}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        data?: ProdutoRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar produtos.");
      setRows(json.data ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Erro ao carregar produtos.");
    } finally {
      setFiltrosCarregando(false);
    }
  }, [montarQueryProdutos]);

  function aplicarFiltros() {
    void refetchLista();
  }

  function limparFiltros() {
    setFiltroEmpresaId(String(empresaIdPadrao));
    setFiltroProduto("");
    setFiltroTipo("");
    setFiltroStatus("");
    setFiltroEstoqueOp("");
    setFiltroEstoqueValor("");
    void (async () => {
      setFiltrosCarregando(true);
      setListError(null);
      try {
        const p = new URLSearchParams();
        p.set("id_empresa", String(empresaIdPadrao));
        const res = await fetch(`/api/produtos?${p.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          data?: ProdutoRow[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar produtos.");
        setRows(json.data ?? []);
      } catch (e) {
        setListError(e instanceof Error ? e.message : "Erro ao carregar produtos.");
      } finally {
        setFiltrosCarregando(false);
      }
    })();
  }

  const mostrarColunaEmpresa = empresas.length > 1;

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function resetForm() {
    setEditing(null);
    setForm(defaultForm());
    setFormError(null);
  }

  function openCreate() {
    resetForm();
    setModalOpen(true);
  }

  function openEdit(row: ProdutoRow) {
    setEditing(row);
    setForm({
      produto: row.produto,
      descricao: row.descricao ?? "",
      un_medida: row.un_medida || "UN",
      preco: row.preco,
      qtd_estoque: row.qtd_estoque,
      desconto_padrao: row.desconto_padrao ?? 0,
      preco_venda:
        row.preco_venda !== null && typeof row.preco_venda !== "undefined"
          ? row.preco_venda
          : null,
      ncm: row.ncm,
      cest: row.cest ?? "",
      origem: row.origem,
      csosn: row.csosn,
      cfop: row.cfop,
      pis_cst: row.pis_cst ?? "07",
      cofins_cst: row.cofins_cst ?? "07",
      ativo: row.ativo,
      servico: row.servico ?? false,
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    resetForm();
  }

  function buildPayload(): Record<string, unknown> {
    return {
      produto: form.produto.trim(),
      descricao: form.descricao.trim() || null,
      un_medida: form.un_medida.trim() || "UN",
      preco: form.preco,
      qtd_estoque: form.qtd_estoque,
      desconto_padrao: form.desconto_padrao,
      preco_venda: form.preco_venda,
      ncm: form.ncm,
      cest: form.cest.trim() || null,
      origem: form.origem,
      csosn: form.csosn,
      cfop: form.cfop,
      pis_cst: form.pis_cst,
      cofins_cst: form.cofins_cst,
      ativo: form.ativo,
      servico: form.servico,
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.produto.trim()) {
      setFormError("Informe o nome do produto.");
      return;
    }
    if (!/^\d{8}$/.test(form.ncm.replace(/\D/g, ""))) {
      setFormError("NCM deve ter 8 dígitos.");
      return;
    }
    if (
      form.desconto_padrao < 0 ||
      form.desconto_padrao > 100 ||
      !Number.isFinite(form.desconto_padrao)
    ) {
      setFormError("Desconto padrão deve ser entre 0 e 100%.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = buildPayload();
      const url = editing ? `/api/produtos/${editing.id}` : "/api/produtos";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar produto.");

      closeModal();
      setFeedback({
        title: editing ? "Produto atualizado" : "Produto cadastrado",
        message: editing
          ? `As alterações em "${String(payload.produto)}" foram salvas.`
          : `O produto "${String(payload.produto)}" foi cadastrado.`,
      });
      void refetchLista();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar produto.");
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
      const res = await fetch(`/api/produtos/${confirmStatus.row.id}`, {
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
        title: novoAtivo ? "Produto ativado" : "Produto desativado",
        message: novoAtivo
          ? `"${confirmStatus.row.produto}" foi ativado.`
          : `"${confirmStatus.row.produto}" foi desativado.`,
      });
      setConfirmStatus(null);
      void refetchLista();
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

      <div className="card card-outline card-secondary mb-3">
        <div className="card-header py-2">
          <h3 className="card-title text-sm mb-0">Filtros</h3>
        </div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group col-md-6 col-lg-4">
              <label htmlFor="filtro-empresa">Empresa</label>
              <select
                id="filtro-empresa"
                className="form-control form-control-sm"
                value={filtroEmpresaId}
                onChange={(e) => setFiltroEmpresaId(e.target.value)}
              >
                {empresas.length === 0 ? (
                  <option value={String(empresaIdPadrao)}>
                    {nomeEmpresaLabel(empresas, empresaIdPadrao)}
                  </option>
                ) : (
                  empresas.map((e) => (
                    <option key={e.id} value={String(e.id)}>
                      {e.nome_fantasia?.trim() || `Empresa #${e.id}`}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="form-group col-md-6 col-lg-4">
              <label htmlFor="filtro-produto">Produto (nome)</label>
              <input
                id="filtro-produto"
                type="search"
                className="form-control form-control-sm"
                placeholder="Buscar por nome"
                value={filtroProduto}
                onChange={(e) => setFiltroProduto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    aplicarFiltros();
                  }
                }}
              />
            </div>
            <div className="form-group col-md-4 col-lg-2">
              <label htmlFor="filtro-tipo">Tipo</label>
              <select
                id="filtro-tipo"
                className="form-control form-control-sm"
                value={filtroTipo}
                onChange={(e) =>
                  setFiltroTipo(e.target.value as "" | "servico" | "mercadoria")
                }
              >
                <option value="">Todos</option>
                <option value="servico">Serviço</option>
                <option value="mercadoria">Mercadoria</option>
              </select>
            </div>
            <div className="form-group col-md-4 col-lg-2">
              <label htmlFor="filtro-status">Status</label>
              <select
                id="filtro-status"
                className="form-control form-control-sm"
                value={filtroStatus}
                onChange={(e) =>
                  setFiltroStatus(e.target.value as "" | "ativo" | "inativo")
                }
              >
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          </div>
          <div className="form-row align-items-end">
            <div className="form-group col-md-4 col-lg-2">
              <label htmlFor="filtro-est-op">Estoque</label>
              <select
                id="filtro-est-op"
                className="form-control form-control-sm"
                value={filtroEstoqueOp}
                onChange={(e) =>
                  setFiltroEstoqueOp(e.target.value as "" | "gt" | "lt" | "eq")
                }
              >
                <option value="">Ignorar</option>
                <option value="gt">Maior que</option>
                <option value="lt">Menor que</option>
                <option value="eq">Igual a</option>
              </select>
            </div>
            <div className="form-group col-md-4 col-lg-2">
              <label htmlFor="filtro-est-val">Quantidade</label>
              <input
                id="filtro-est-val"
                type="number"
                className="form-control form-control-sm"
                min={0}
                step={1}
                placeholder="0"
                disabled={!filtroEstoqueOp}
                value={filtroEstoqueValor}
                onChange={(e) => setFiltroEstoqueValor(e.target.value)}
              />
            </div>
            <div className="form-group col-md-12 col-lg-8 mb-md-0">
              <button
                type="button"
                className="btn btn-primary btn-sm mr-2"
                disabled={filtrosCarregando}
                onClick={() => aplicarFiltros()}
              >
                {filtrosCarregando ? "Filtrando..." : "Aplicar filtros"}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={filtrosCarregando}
                onClick={() => limparFiltros()}
              >
                Limpar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card card-outline card-primary">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center">
          <h3 className="card-title mb-2 mb-sm-0">Produtos</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
            <i className="fas fa-plus mr-1" aria-hidden /> Novo produto
          </button>
        </div>
        <div className="card-body table-responsive p-0">
          <table className="table table-hover table-striped mb-0">
            <thead>
              <tr>
                {mostrarColunaEmpresa ? (
                  <th style={{ width: "140px" }}>Empresa</th>
                ) : null}
                <th style={{ width: "100px" }}>Tipo</th>
                <th>SKU</th>
                <th>Produto</th>
                <th style={{ width: "110px" }} className="text-right">
                  Preço
                </th>
                <th style={{ width: "90px" }} className="text-right">
                  Estoque
                </th>
                <th style={{ width: "100px" }}>NCM</th>
                <th style={{ width: "90px" }}>Status</th>
                <th style={{ width: "220px" }} className="text-right">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={mostrarColunaEmpresa ? 9 : 8}
                    className="text-center text-muted py-4"
                  >
                    Nenhum produto cadastrado.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    {mostrarColunaEmpresa ? (
                      <td className="small text-muted">
                        {nomeEmpresaLabel(empresas, row.id_empresa ?? empresaIdPadrao)}
                      </td>
                    ) : null}
                    <td>
                      {row.servico ? (
                        <span className="badge badge-info">Serviço</span>
                      ) : (
                        <span className="badge badge-secondary">Produto</span>
                      )}
                    </td>
                    <td className="text-muted small">{row.sku ?? "—"}</td>
                    <td>{row.produto}</td>
                    <td className="text-right">{formatBRL(row.preco)}</td>
                    <td className="text-right">{row.qtd_estoque}</td>
                    <td>
                      <code className="small">{row.ncm}</code>
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
          <div className="modal-dialog modal-lg modal-usuario-form" role="document">
            <div className="modal-content">
              <form onSubmit={(e) => void submit(e)}>
                <div className="modal-header">
                  <h5 className="modal-title" id={modalTitleId}>
                    {editing ? "Editar produto" : "Novo produto"}
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

                  <h6 className="text-muted border-bottom pb-2 mb-3">Dados gerais</h6>
                  {editing ? (
                    <div className="form-row">
                      <div className="form-group col-md-6">
                        <label htmlFor="prod-sku-ro">SKU</label>
                        <input
                          id="prod-sku-ro"
                          className="form-control bg-light"
                          readOnly
                          value={editing.sku ?? ""}
                          tabIndex={-1}
                        />
                      </div>
                      <div className="form-group col-md-6">
                        <label htmlFor="prod-barcode-ro">Código de barras (EAN-13)</label>
                        <input
                          id="prod-barcode-ro"
                          className="form-control bg-light"
                          readOnly
                          value={editing.barcode ?? ""}
                          tabIndex={-1}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="alert alert-light border small mb-3 py-2" role="note">
                      <i className="fas fa-info-circle text-primary mr-1" aria-hidden />
                      Ao salvar, o sistema gera automaticamente o <strong>SKU</strong>{" "}
                      (código interno) e o <strong>código de barras EAN-13</strong> (prefixo 789,
                      uso interno).
                    </div>
                  )}
                  <div className="form-group">
                    <label htmlFor="prod-nome">Nome do produto</label>
                    <input
                      id="prod-nome"
                      className="form-control"
                      value={form.produto}
                      onChange={(e) => setField("produto", e.target.value)}
                      required
                      maxLength={255}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="prod-desc">Descrição</label>
                    <textarea
                      id="prod-desc"
                      className="form-control"
                      rows={2}
                      value={form.descricao}
                      onChange={(e) => setField("descricao", e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group col-md-4">
                      <label htmlFor="prod-um">Unidade</label>
                      <input
                        id="prod-um"
                        className="form-control"
                        placeholder="UN, KG, CX..."
                        value={form.un_medida}
                        onChange={(e) => setField("un_medida", e.target.value)}
                        maxLength={10}
                      />
                    </div>
                    <div className="form-group col-md-4">
                      <label htmlFor="prod-preco">Preço</label>
                      <input
                        id="prod-preco"
                        type="number"
                        className="form-control"
                        min={0}
                        step={0.01}
                        value={form.preco}
                        onChange={(e) =>
                          setField("preco", Number.parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                    <div className="form-group col-md-4">
                      <label htmlFor="prod-qtd">Qtd. estoque</label>
                      <input
                        id="prod-qtd"
                        type="number"
                        className="form-control"
                        min={0}
                        step={1}
                        value={form.qtd_estoque}
                        onChange={(e) =>
                          setField("qtd_estoque", Number.parseInt(e.target.value, 10) || 0)
                        }
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group col-md-6">
                      <label htmlFor="prod-desc-pad">Desconto padrão da loja (%)</label>
                      <input
                        id="prod-desc-pad"
                        type="number"
                        className="form-control"
                        min={0}
                        max={100}
                        step={0.01}
                        value={form.desconto_padrao}
                        onChange={(e) =>
                          setField(
                            "desconto_padrao",
                            Number.parseFloat(e.target.value) || 0,
                          )
                        }
                      />
                    </div>
                    <div className="form-group col-md-6">
                      <label htmlFor="prod-preco-venda">Preço promocional fixo</label>
                      <input
                        id="prod-preco-venda"
                        type="number"
                        className="form-control"
                        min={0}
                        step={0.01}
                        placeholder="Opcional — deixe em branco se não houver"
                        value={form.preco_venda === null ? "" : form.preco_venda}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") setField("preco_venda", null);
                          else setField("preco_venda", Number.parseFloat(v));
                        }}
                      />
                      <small className="form-text text-muted">
                        Valor fixo de venda em promoção; vazio = sem promoção cadastrada.
                      </small>
                    </div>
                  </div>

                  <div className="form-group mb-0">
                    <div className="custom-control custom-switch">
                      <input
                        type="checkbox"
                        className="custom-control-input"
                        id="prod-servico"
                        checked={form.servico}
                        disabled={
                          editing ? editing.id_procedimento != null : false
                        }
                        onChange={(e) => setField("servico", e.target.checked)}
                      />
                      <label className="custom-control-label" htmlFor="prod-servico">
                        É serviço (não é mercadoria)
                      </label>
                    </div>
                    {editing && editing.id_procedimento != null ? (
                      <small className="form-text text-muted">
                        Gerado a partir do cadastro de procedimentos; permanece como serviço.
                      </small>
                    ) : null}
                  </div>

                  <h6 className="text-muted border-bottom pb-2 mb-3 mt-2">
                    Impostos / NF-e (Simples Nacional)
                  </h6>
                  <div className="form-row">
                    <div className="form-group col-md-4">
                      <label htmlFor="prod-ncm">NCM (8 dígitos)</label>
                      <input
                        id="prod-ncm"
                        className="form-control"
                        placeholder="00000000"
                        value={form.ncm}
                        onChange={(e) => setField("ncm", e.target.value)}
                        inputMode="numeric"
                      />
                    </div>
                    <div className="form-group col-md-4">
                      <label htmlFor="prod-cest">CEST (7 dígitos)</label>
                      <input
                        id="prod-cest"
                        className="form-control"
                        placeholder="Opcional"
                        value={form.cest}
                        onChange={(e) => setField("cest", e.target.value)}
                        inputMode="numeric"
                      />
                    </div>
                    <div className="form-group col-md-4">
                      <label htmlFor="prod-origem">Origem</label>
                      <select
                        id="prod-origem"
                        className="form-control"
                        value={form.origem}
                        onChange={(e) =>
                          setField("origem", Number.parseInt(e.target.value, 10))
                        }
                      >
                        {ORIGENS_ICMS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group col-md-4">
                      <label htmlFor="prod-csosn">CSOSN</label>
                      <input
                        id="prod-csosn"
                        className="form-control"
                        placeholder="102"
                        value={form.csosn}
                        onChange={(e) => setField("csosn", e.target.value)}
                        maxLength={3}
                        inputMode="numeric"
                      />
                    </div>
                    <div className="form-group col-md-4">
                      <label htmlFor="prod-cfop">CFOP</label>
                      <input
                        id="prod-cfop"
                        className="form-control"
                        placeholder="5102"
                        value={form.cfop}
                        onChange={(e) => setField("cfop", e.target.value)}
                        maxLength={4}
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group col-md-4">
                      <label htmlFor="prod-pis">CST PIS</label>
                      <input
                        id="prod-pis"
                        className="form-control"
                        value={form.pis_cst}
                        onChange={(e) => setField("pis_cst", e.target.value)}
                        maxLength={2}
                        inputMode="numeric"
                      />
                    </div>
                    <div className="form-group col-md-4">
                      <label htmlFor="prod-cofins">CST COFINS</label>
                      <input
                        id="prod-cofins"
                        className="form-control"
                        value={form.cofins_cst}
                        onChange={(e) => setField("cofins_cst", e.target.value)}
                        maxLength={2}
                        inputMode="numeric"
                      />
                    </div>
                  </div>

                  <div className="form-group mb-0">
                    <div className="custom-control custom-switch">
                      <input
                        type="checkbox"
                        className="custom-control-input"
                        id="prod-ativo"
                        checked={form.ativo}
                        onChange={(e) => setField("ativo", e.target.checked)}
                      />
                      <label className="custom-control-label" htmlFor="prod-ativo">
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
                    ? `Ativar o produto "${confirmStatus.row.produto}"?`
                    : `Desativar o produto "${confirmStatus.row.produto}"?`}
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
