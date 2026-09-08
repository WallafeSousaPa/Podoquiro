"use client";

import { formatarCnpjCpf } from "@/lib/estoque/parse-nfe-xml";
import type { ParceiroEstoqueRow } from "@/lib/estoque/parceiro-campos";
import {
  ROTULO_NOTA_VENDA,
  ROTULO_TIPO_SAIDA,
  type NotaVendaStatus,
  type StatusSaidaEstoque,
  type TipoSaidaEstoque,
} from "@/lib/estoque/tipos-saida";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ParceirosEstoqueTab } from "./parceiros-estoque-tab";

export type EmpresaListaItem = {
  id: number;
  nome_fantasia: string | null;
};

type ProdutoOpcao = {
  id: string;
  produto: string;
  sku: string | null;
  barcode: string | null;
  qtd_estoque: number;
  un_medida: string;
  preco: number;
  preco_venda: number | null;
  ativo: boolean;
  servico: boolean;
};

type LinhaSaida = {
  key: string;
  id_produto: string;
  produto: string;
  sku: string | null;
  qtd_estoque: number;
  un_medida: string;
  qtd: number;
  v_un: number;
};

type SaidaListaRow = {
  id: string;
  id_empresa: number;
  tipo: TipoSaidaEstoque;
  status: StatusSaidaEstoque;
  data_saida: string;
  dest_nome: string | null;
  dest_doc: string | null;
  dest_tipo: "CPF" | "CNPJ" | null;
  valor_total: number;
  nota_venda_status: NotaVendaStatus;
  observacao: string | null;
  created_at: string;
};

type SaidaItemDetalhe = {
  id: string;
  n_item: number;
  id_produto: string | null;
  produto: string;
  sku: string | null;
  barcode: string | null;
  un_medida: string | null;
  qtd: number;
  v_un: number;
  v_total: number;
  saldo_anterior: number | null;
  saldo_posterior: number | null;
};

type SaidaDetalhe = SaidaListaRow & {
  emit_nome: string | null;
  emit_fantasia: string | null;
  emit_cnpj: string | null;
  dest_endereco: string | null;
  dest_numero: string | null;
  dest_bairro: string | null;
  dest_municipio: string | null;
  dest_uf: string | null;
  dest_cep: string | null;
  dest_email: string | null;
  dest_fone: string | null;
  payload_nota_venda: unknown;
  itens: SaidaItemDetalhe[];
};

type Aba = "saidas" | "fornecedores" | "compradores";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDataHora(s: string | null) {
  if (!s) return "—";
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

function nomeEmpresaLabel(empresas: EmpresaListaItem[], id: number) {
  const e = empresas.find((x) => x.id === id);
  const n = e?.nome_fantasia?.trim();
  return n || `Empresa #${id}`;
}

function precoSaida(p: ProdutoOpcao): number {
  const v = p.preco_venda != null ? Number(p.preco_venda) : Number(p.preco);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

type Props = {
  empresas: EmpresaListaItem[];
  empresaIdPadrao: number;
  loadError?: string | null;
  podeCancelar?: boolean;
};

export function SaidasEstoqueClient({
  empresas,
  empresaIdPadrao,
  loadError,
  podeCancelar = false,
}: Props) {
  const ids = useId();
  const [aba, setAba] = useState<Aba>("saidas");
  const [empresaId, setEmpresaId] = useState(() => String(empresaIdPadrao));
  const [tipo, setTipo] = useState<TipoSaidaEstoque>("venda");
  const [idComprador, setIdComprador] = useState("");
  const [idEmpresaDestino, setIdEmpresaDestino] = useState("");
  const [observacao, setObservacao] = useState("");
  const [produtoAdd, setProdutoAdd] = useState("");
  const [linhas, setLinhas] = useState<LinhaSaida[]>([]);
  const [produtos, setProdutos] = useState<ProdutoOpcao[]>([]);
  const [compradores, setCompradores] = useState<ParceiroEstoqueRow[]>([]);
  const [lista, setLista] = useState<SaidaListaRow[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<"" | TipoSaidaEstoque>("");
  const [loadingLista, setLoadingLista] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [confirmSaida, setConfirmSaida] = useState(false);
  const [detalhe, setDetalhe] = useState<SaidaDetalhe | null>(null);
  const [confirmCancelar, setConfirmCancelar] = useState<SaidaListaRow | null>(null);

  const nomeEmpresaSelecionada = nomeEmpresaLabel(empresas, Number(empresaId));

  const carregarProdutos = useCallback(async () => {
    const qs = new URLSearchParams({
      id_empresa: empresaId,
      tipo: "mercadoria",
      status: "ativo",
    });
    const res = await fetch(`/api/produtos?${qs}`, { credentials: "include" });
    const j = (await res.json()) as { data?: ProdutoOpcao[]; error?: string };
    if (!res.ok) throw new Error(j.error ?? "Não foi possível carregar os produtos.");
    setProdutos(j.data ?? []);
  }, [empresaId]);

  const carregarCompradores = useCallback(async () => {
    const qs = new URLSearchParams({
      papel: "comprador",
      id_empresa: empresaId,
      status: "ativo",
    });
    const res = await fetch(`/api/estoque/parceiros?${qs}`, { credentials: "include" });
    const j = (await res.json()) as { data?: ParceiroEstoqueRow[]; error?: string };
    if (!res.ok) throw new Error(j.error ?? "Não foi possível carregar os compradores.");
    setCompradores(j.data ?? []);
  }, [empresaId]);

  const carregarLista = useCallback(async () => {
    setLoadingLista(true);
    try {
      const qs = new URLSearchParams({ id_empresa: empresaId });
      if (filtroTipo) qs.set("tipo", filtroTipo);
      const res = await fetch(`/api/estoque/saidas?${qs}`, { credentials: "include" });
      const j = (await res.json()) as { data?: SaidaListaRow[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível carregar as saídas.");
      setLista(j.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar as saídas.");
    } finally {
      setLoadingLista(false);
    }
  }, [empresaId, filtroTipo]);

  useEffect(() => {
    setLinhas([]);
    setProdutoAdd("");
    setIdComprador("");
    setIdEmpresaDestino("");
    setError(null);
    void carregarProdutos().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Falha ao carregar produtos.");
    });
    void carregarCompradores().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Falha ao carregar compradores.");
    });
  }, [carregarProdutos, carregarCompradores]);

  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);

  useEffect(() => {
    if (aba !== "saidas") return;
    void carregarCompradores().catch(() => undefined);
    void carregarProdutos().catch(() => undefined);
  }, [aba, carregarCompradores, carregarProdutos]);

  const idsNaLista = useMemo(() => new Set(linhas.map((l) => l.id_produto)), [linhas]);
  const produtosDisponiveis = useMemo(
    () => produtos.filter((p) => !p.servico && p.ativo && !idsNaLista.has(p.id)),
    [produtos, idsNaLista],
  );

  const valorTotal = useMemo(
    () => linhas.reduce((s, l) => s + l.qtd * l.v_un, 0),
    [linhas],
  );

  const compradorSel = compradores.find((c) => c.id === idComprador) ?? null;
  const estoqueInsuficiente = linhas.some((l) => l.qtd > l.qtd_estoque);

  function adicionarProduto() {
    const p = produtos.find((x) => x.id === produtoAdd);
    if (!p) return;
    setLinhas((prev) => [
      ...prev,
      {
        key: `${p.id}-${Date.now()}`,
        id_produto: p.id,
        produto: p.produto,
        sku: p.sku,
        qtd_estoque: Number(p.qtd_estoque) || 0,
        un_medida: p.un_medida || "UN",
        qtd: 1,
        v_un: precoSaida(p),
      },
    ]);
    setProdutoAdd("");
  }

  function atualizarLinha(key: string, patch: Partial<LinhaSaida>) {
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function podeConfirmar(): string | null {
    if (linhas.length === 0) return "Inclua ao menos um produto.";
    if (linhas.some((l) => l.qtd <= 0)) return "Quantidade deve ser maior que zero.";
    if (tipo === "venda" && !idComprador) return "Selecione o comprador (destinatário).";
    if (tipo === "transferencia" && !idEmpresaDestino) {
      return "Selecione a empresa de destino.";
    }
    if (tipo === "transferencia" && idEmpresaDestino === empresaId) {
      return "A empresa de destino deve ser diferente da origem.";
    }
    return null;
  }

  async function confirmarSaida() {
    const bloqueio = podeConfirmar();
    if (bloqueio) {
      setError(bloqueio);
      setConfirmSaida(false);
      return;
    }
    setEnviando(true);
    setError(null);
    setSucesso(null);
    try {
      const res = await fetch("/api/estoque/saidas", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_empresa: Number(empresaId),
          tipo,
          id_comprador: tipo === "venda" || tipo === "avulso" ? idComprador || null : null,
          id_empresa_destino: tipo === "transferencia" ? Number(idEmpresaDestino) : null,
          observacao,
          itens: linhas.map((l) => ({
            id_produto: l.id_produto,
            qtd: l.qtd,
            v_un: l.v_un,
          })),
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível registrar a saída.");
      setConfirmSaida(false);
      setLinhas([]);
      setObservacao("");
      setSucesso(
        tipo === "venda"
          ? "Saída registrada. A nota de venda ficou pronta (ainda não foi gerada)."
          : "Saída registrada e estoque baixado.",
      );
      await Promise.all([carregarLista(), carregarProdutos()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar a saída.");
    } finally {
      setEnviando(false);
    }
  }

  async function abrirDetalhe(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/estoque/saidas/${id}`, { credentials: "include" });
      const j = (await res.json()) as { data?: SaidaDetalhe; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível abrir a saída.");
      if (j.data) setDetalhe(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível abrir a saída.");
    }
  }

  async function cancelarSaida(row: SaidaListaRow) {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/estoque/saidas/${row.id}/cancelar`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível cancelar.");
      setConfirmCancelar(null);
      setDetalhe(null);
      setSucesso("Saída cancelada e estoque devolvido.");
      await Promise.all([carregarLista(), carregarProdutos()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cancelar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {loadError ? (
        <div className="alert alert-warning py-2 small" role="alert">
          {loadError}
        </div>
      ) : null}

      <ul className="nav nav-pills mb-3">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link${aba === "saidas" ? " active" : ""}`}
            onClick={() => setAba("saidas")}
          >
            Saídas
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link${aba === "fornecedores" ? " active" : ""}`}
            onClick={() => setAba("fornecedores")}
          >
            Fornecedores
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link${aba === "compradores" ? " active" : ""}`}
            onClick={() => setAba("compradores")}
          >
            Compradores
          </button>
        </li>
      </ul>

      <div className="form-group" style={{ maxWidth: "22rem" }}>
        <label htmlFor={`${ids}-empresa`}>Empresa do estoque</label>
        <select
          id={`${ids}-empresa`}
          className="form-control"
          value={empresaId}
          disabled={enviando}
          onChange={(e) => setEmpresaId(e.target.value)}
        >
          {empresas.length === 0 ? (
            <option value={String(empresaIdPadrao)}>
              {nomeEmpresaLabel(empresas, empresaIdPadrao)}
            </option>
          ) : (
            empresas.map((emp) => (
              <option key={emp.id} value={String(emp.id)}>
                {emp.nome_fantasia?.trim() || `Empresa #${emp.id}`}
              </option>
            ))
          )}
        </select>
      </div>

      {aba === "fornecedores" ? (
        <ParceirosEstoqueTab papel="fornecedor" empresaId={empresaId} disabled={enviando} />
      ) : null}
      {aba === "compradores" ? (
        <ParceirosEstoqueTab papel="comprador" empresaId={empresaId} disabled={enviando} />
      ) : null}

      {aba === "saidas" ? (
        <>
          <div className="card card-outline card-primary mb-3">
            <div className="card-header">
              <h3 className="card-title mb-0">Nova saída</h3>
            </div>
            <div className="card-body">
              <p className="text-muted small mb-3">
                Baixa produtos do estoque de <strong>{nomeEmpresaSelecionada}</strong>.
                Tipos: venda, transferência, perda e avulso. Na venda, o destinatário é o
                comprador cadastrado e a nota fica <strong>pronta</strong> — a emissão ainda
                não é feita.
              </p>
              {error ? (
                <div className="alert alert-danger py-2 small" role="alert">
                  {error}
                </div>
              ) : null}
              {sucesso ? (
                <div className="alert alert-success py-2 small" role="alert">
                  {sucesso}
                </div>
              ) : null}

              <div className="row">
                <div className="col-md-4 form-group">
                  <label htmlFor={`${ids}-tipo`}>Tipo de saída</label>
                  <select
                    id={`${ids}-tipo`}
                    className="form-control"
                    value={tipo}
                    disabled={enviando}
                    onChange={(e) => setTipo(e.target.value as TipoSaidaEstoque)}
                  >
                    {(Object.keys(ROTULO_TIPO_SAIDA) as TipoSaidaEstoque[]).map((t) => (
                      <option key={t} value={t}>
                        {ROTULO_TIPO_SAIDA[t]}
                      </option>
                    ))}
                  </select>
                </div>

                {tipo === "venda" || tipo === "avulso" ? (
                  <div className="col-md-8 form-group">
                    <label htmlFor={`${ids}-comprador`}>
                      Comprador {tipo === "venda" ? "*" : "(opcional)"}
                    </label>
                    <select
                      id={`${ids}-comprador`}
                      className="form-control"
                      value={idComprador}
                      disabled={enviando}
                      onChange={(e) => setIdComprador(e.target.value)}
                    >
                      <option value="">
                        {compradores.length === 0
                          ? "Cadastre um comprador na aba Compradores"
                          : "Selecione…"}
                      </option>
                      {compradores.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome} — {formatarCnpjCpf(c.doc, c.tipo_doc)}
                        </option>
                      ))}
                    </select>
                    {tipo === "venda" ? (
                      <small className="form-text text-muted">
                        Origem: {nomeEmpresaSelecionada}. Destinatário: o comprador
                        selecionado. A nota de venda será só preparada.
                      </small>
                    ) : null}
                  </div>
                ) : null}

                {tipo === "transferencia" ? (
                  <div className="col-md-8 form-group">
                    <label htmlFor={`${ids}-dest-emp`}>Empresa destino *</label>
                    <select
                      id={`${ids}-dest-emp`}
                      className="form-control"
                      value={idEmpresaDestino}
                      disabled={enviando}
                      onChange={(e) => setIdEmpresaDestino(e.target.value)}
                    >
                      <option value="">Selecione…</option>
                      {empresas
                        .filter((e) => String(e.id) !== empresaId)
                        .map((emp) => (
                          <option key={emp.id} value={String(emp.id)}>
                            {emp.nome_fantasia?.trim() || `Empresa #${emp.id}`}
                          </option>
                        ))}
                    </select>
                    <small className="form-text text-muted">
                      A baixa ocorre na empresa de origem. A entrada no destino não é
                      automática.
                    </small>
                  </div>
                ) : null}

                {tipo === "perda" ? (
                  <div className="col-md-8 form-group">
                    <p className="form-text text-muted mt-4 mb-0">
                      Perda baixa o estoque sem destinatário. Informe o motivo na
                      observação.
                    </p>
                  </div>
                ) : null}
              </div>

              {compradorSel && (tipo === "venda" || tipo === "avulso") ? (
                <div className="alert alert-info py-2 small">
                  Destinatário: <strong>{compradorSel.nome}</strong>
                  {" · "}
                  {formatarCnpjCpf(compradorSel.doc, compradorSel.tipo_doc)}
                  {compradorSel.municipio
                    ? ` · ${compradorSel.municipio}/${compradorSel.uf ?? ""}`
                    : ""}
                </div>
              ) : null}

              <div className="form-row align-items-end mb-3">
                <div className="col-md-8 form-group mb-md-0">
                  <label htmlFor={`${ids}-prod`}>Adicionar produto</label>
                  <select
                    id={`${ids}-prod`}
                    className="form-control"
                    value={produtoAdd}
                    disabled={enviando}
                    onChange={(e) => setProdutoAdd(e.target.value)}
                  >
                    <option value="">Selecione o produto…</option>
                    {produtosDisponiveis.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.produto} · estoque {p.qtd_estoque}
                        {p.sku ? ` · ${p.sku}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4 form-group mb-0">
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-block"
                    disabled={!produtoAdd || enviando}
                    onClick={adicionarProduto}
                  >
                    Incluir na saída
                  </button>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-sm table-striped mb-2">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th className="text-right" style={{ width: "7rem" }}>
                        Estoque
                      </th>
                      <th className="text-right" style={{ width: "8rem" }}>
                        Qtd. saída
                      </th>
                      <th className="text-right" style={{ width: "9rem" }}>
                        V. unit.
                      </th>
                      <th className="text-right" style={{ width: "8rem" }}>
                        Total
                      </th>
                      <th style={{ width: "3rem" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-muted text-center py-3">
                          Nenhum produto na saída.
                        </td>
                      </tr>
                    ) : (
                      linhas.map((l) => {
                        const apos = l.qtd_estoque - l.qtd;
                        return (
                          <tr key={l.key} className={l.qtd > l.qtd_estoque ? "table-warning" : undefined}>
                            <td>
                              <div>{l.produto}</div>
                              <div className="small text-muted">
                                {l.sku ? `SKU ${l.sku} · ` : ""}
                                {l.un_medida} · após saída: {apos}
                              </div>
                            </td>
                            <td className="text-right">{l.qtd_estoque}</td>
                            <td>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                className="form-control form-control-sm text-right"
                                value={l.qtd}
                                disabled={enviando}
                                onChange={(e) => {
                                  const n = Number.parseInt(e.target.value, 10);
                                  atualizarLinha(l.key, {
                                    qtd: Number.isFinite(n) && n > 0 ? n : 1,
                                  });
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                className="form-control form-control-sm text-right"
                                value={l.v_un}
                                disabled={enviando}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  atualizarLinha(l.key, {
                                    v_un: Number.isFinite(n) && n >= 0 ? n : 0,
                                  });
                                }}
                              />
                            </td>
                            <td className="text-right">{formatBRL(l.qtd * l.v_un)}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-link text-danger p-0"
                                disabled={enviando}
                                aria-label={`Remover ${l.produto}`}
                                onClick={() =>
                                  setLinhas((prev) => prev.filter((x) => x.key !== l.key))
                                }
                              >
                                <i className="fas fa-times" aria-hidden />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {linhas.length > 0 ? (
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="text-right">
                          <strong>Total</strong>
                        </td>
                        <td className="text-right">
                          <strong>{formatBRL(valorTotal)}</strong>
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>

              {estoqueInsuficiente ? (
                <p className="small text-warning mb-2">
                  Há item com quantidade maior que o estoque atual. A saída ainda pode
                  ser confirmada (o saldo fica negativo).
                </p>
              ) : null}

              <div className="form-group">
                <label htmlFor={`${ids}-obs`}>Observação</label>
                <textarea
                  id={`${ids}-obs`}
                  className="form-control"
                  rows={2}
                  value={observacao}
                  disabled={enviando}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="btn btn-success"
                disabled={enviando || linhas.length === 0}
                onClick={() => {
                  const bloqueio = podeConfirmar();
                  if (bloqueio) {
                    setError(bloqueio);
                    return;
                  }
                  setError(null);
                  setConfirmSaida(true);
                }}
              >
                <i className="fas fa-sign-out-alt mr-1" aria-hidden />
                Confirmar saída
              </button>
            </div>
          </div>

          <div className="card card-outline card-secondary">
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center">
              <h3 className="card-title mb-2 mb-sm-0">
                Saídas — {nomeEmpresaSelecionada}
              </h3>
              <select
                className="form-control form-control-sm"
                style={{ width: "12rem" }}
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value as "" | TipoSaidaEstoque)}
                aria-label="Filtrar por tipo"
              >
                <option value="">Todos os tipos</option>
                {(Object.keys(ROTULO_TIPO_SAIDA) as TipoSaidaEstoque[]).map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_SAIDA[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="card-body table-responsive p-0">
              <table className="table table-hover table-sm mb-0">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Destino</th>
                    <th className="text-right">Valor</th>
                    <th>Nota</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loadingLista ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        Carregando…
                      </td>
                    </tr>
                  ) : lista.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        Nenhuma saída nesta empresa.
                      </td>
                    </tr>
                  ) : (
                    lista.map((row) => (
                      <tr
                        key={row.id}
                        className={row.status === "cancelada" ? "text-muted" : undefined}
                      >
                        <td className="small">{formatDataHora(row.data_saida)}</td>
                        <td>{ROTULO_TIPO_SAIDA[row.tipo]}</td>
                        <td>
                          <div>{row.dest_nome || "—"}</div>
                          {row.dest_doc ? (
                            <div className="small text-muted">
                              {formatarCnpjCpf(row.dest_doc, row.dest_tipo)}
                            </div>
                          ) : null}
                        </td>
                        <td className="text-right">{formatBRL(Number(row.valor_total))}</td>
                        <td className="small">
                          {row.tipo === "venda"
                            ? ROTULO_NOTA_VENDA[row.nota_venda_status]
                            : "—"}
                        </td>
                        <td>
                          {row.status === "cancelada" ? (
                            <span className="badge badge-secondary">Cancelada</span>
                          ) : (
                            <span className="badge badge-success">Confirmada</span>
                          )}
                        </td>
                        <td className="text-right text-nowrap">
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm"
                            onClick={() => void abrirDetalhe(row.id)}
                          >
                            Ver
                          </button>
                          {podeCancelar && row.status === "confirmada" ? (
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm ml-1"
                              disabled={enviando}
                              onClick={() => setConfirmCancelar(row)}
                            >
                              Cancelar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {confirmSaida ? (
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
                  <h5 className="modal-title">Confirmar saída</h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={() => setConfirmSaida(false)}
                    disabled={enviando}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
                <div className="modal-body">
                  <p>
                    Confirmar <strong>{ROTULO_TIPO_SAIDA[tipo]}</strong> de{" "}
                    {linhas.length} produto(s) no estoque de{" "}
                    <strong>{nomeEmpresaSelecionada}</strong>? Total{" "}
                    <strong>{formatBRL(valorTotal)}</strong>.
                  </p>
                  {tipo === "venda" ? (
                    <p className="mb-0 text-muted small">
                      A nota de venda origem → destinatário ficará pronta. Por enquanto
                      ela não será gerada.
                    </p>
                  ) : null}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setConfirmSaida(false)}
                    disabled={enviando}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => void confirmarSaida()}
                    disabled={enviando}
                  >
                    {enviando ? "Processando…" : "Confirmar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" role="presentation" />
        </>
      ) : null}

      {detalhe ? (
        <>
          <div
            className="modal fade show"
            style={{ display: "block" }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-dialog modal-lg" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    Saída — {ROTULO_TIPO_SAIDA[detalhe.tipo]}
                  </h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={() => setDetalhe(null)}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
                <div className="modal-body">
                  <p className="small text-muted mb-2">
                    {formatDataHora(detalhe.data_saida)}
                    {detalhe.status === "cancelada" ? " · Cancelada" : ""}
                  </p>
                  <p className="mb-1">
                    Origem: <strong>{detalhe.emit_fantasia || detalhe.emit_nome || "—"}</strong>
                    {detalhe.emit_cnpj
                      ? ` · ${formatarCnpjCpf(detalhe.emit_cnpj, "CNPJ")}`
                      : ""}
                  </p>
                  <p className="mb-2">
                    Destino: <strong>{detalhe.dest_nome || "—"}</strong>
                    {detalhe.dest_doc
                      ? ` · ${formatarCnpjCpf(detalhe.dest_doc, detalhe.dest_tipo)}`
                      : ""}
                  </p>
                  {detalhe.tipo === "venda" ? (
                    <p className="small">
                      Nota de venda:{" "}
                      <strong>{ROTULO_NOTA_VENDA[detalhe.nota_venda_status]}</strong>
                    </p>
                  ) : null}
                  {detalhe.observacao ? (
                    <p className="small">Obs.: {detalhe.observacao}</p>
                  ) : null}
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Produto</th>
                        <th className="text-right">Qtd</th>
                        <th className="text-right">V. unit.</th>
                        <th className="text-right">Total</th>
                        <th className="text-right">Estoque</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhe.itens.map((it) => (
                        <tr key={it.id}>
                          <td>{it.n_item}</td>
                          <td>
                            {it.produto}
                            {it.sku ? (
                              <div className="small text-muted">{it.sku}</div>
                            ) : null}
                          </td>
                          <td className="text-right">{it.qtd}</td>
                          <td className="text-right">{formatBRL(Number(it.v_un))}</td>
                          <td className="text-right">{formatBRL(Number(it.v_total))}</td>
                          <td className="text-right small">
                            {it.saldo_anterior ?? "—"} → {it.saldo_posterior ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="text-right">
                          <strong>Total</strong>
                        </td>
                        <td className="text-right">
                          <strong>{formatBRL(Number(detalhe.valor_total))}</strong>
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="modal-footer">
                  {podeCancelar && detalhe.status === "confirmada" ? (
                    <button
                      type="button"
                      className="btn btn-outline-danger mr-auto"
                      onClick={() => {
                        setConfirmCancelar(detalhe);
                        setDetalhe(null);
                      }}
                    >
                      Cancelar saída
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setDetalhe(null)}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" role="presentation" />
        </>
      ) : null}

      {confirmCancelar ? (
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
                  <h5 className="modal-title">Cancelar saída</h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={() => setConfirmCancelar(null)}
                    disabled={enviando}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
                <div className="modal-body">
                  Devolver ao estoque os produtos da saída{" "}
                  <strong>{ROTULO_TIPO_SAIDA[confirmCancelar.tipo]}</strong> de{" "}
                  {formatDataHora(confirmCancelar.data_saida)}?
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setConfirmCancelar(null)}
                    disabled={enviando}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void cancelarSaida(confirmCancelar)}
                    disabled={enviando}
                  >
                    {enviando ? "Cancelando…" : "Cancelar e devolver"}
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
