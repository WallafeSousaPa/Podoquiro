"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ProdutoApi = {
  id: string;
  produto: string;
  sku: string | null;
  un_medida: string | null;
  preco: number | null;
  preco_venda: number | null;
};

type ItemSelecionado = {
  id_produto: string;
  produto: string;
  un_medida: string;
  preco: number;
  quantidade: number;
};

type Props = {
  aberto: boolean;
  onFechar: () => void;
  onEmitido: () => void;
};

type EmissaoResposta = {
  ok?: boolean;
  chave?: string;
  nNF?: number;
  serie?: number;
  cStatProt?: string | null;
  cStatLote?: string | null;
  xMotivo?: string;
  protocolo?: string | null;
  error?: string;
};

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function precoBase(p: ProdutoApi): number {
  if (p.preco_venda != null && Number(p.preco_venda) >= 0) {
    return Number(p.preco_venda);
  }
  return Number(p.preco ?? 0);
}

const DEST_VAZIO = {
  documento: "",
  x_nome: "",
  x_lgr: "",
  nro: "",
  x_bairro: "",
  c_mun: "",
  x_mun: "",
  uf: "",
  cep: "",
};

export function ModalEmissaoNfce({ aberto, onFechar, onEmitido }: Props) {
  const [produtos, setProdutos] = useState<ProdutoApi[]>([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(false);
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<ItemSelecionado[]>([]);
  const [dest, setDest] = useState({ ...DEST_VAZIO });
  const [naturezaOperacao, setNaturezaOperacao] = useState(
    "VENDA DE MERCADORIA",
  );

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<EmissaoResposta | null>(null);

  const resetar = useCallback(() => {
    setBusca("");
    setItens([]);
    setDest({ ...DEST_VAZIO });
    setNaturezaOperacao("VENDA DE MERCADORIA");
    setErro(null);
    setResultado(null);
    setEnviando(false);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    resetar();
    setCarregandoProdutos(true);
    void (async () => {
      try {
        const res = await fetch(
          "/api/produtos?tipo=mercadoria&status=ativo",
          { credentials: "include" },
        );
        const j = (await res.json()) as { data?: ProdutoApi[]; error?: string };
        if (!res.ok) throw new Error(j.error ?? "Erro ao carregar produtos.");
        setProdutos(j.data ?? []);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao carregar produtos.");
      } finally {
        setCarregandoProdutos(false);
      }
    })();
  }, [aberto, resetar]);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const jaAdicionados = new Set(itens.map((i) => i.id_produto));
    return produtos
      .filter((p) => !jaAdicionados.has(p.id))
      .filter((p) =>
        termo.length === 0
          ? true
          : p.produto.toLowerCase().includes(termo) ||
            (p.sku ?? "").toLowerCase().includes(termo),
      )
      .slice(0, 30);
  }, [produtos, busca, itens]);

  const adicionarItem = (p: ProdutoApi) => {
    setItens((prev) => [
      ...prev,
      {
        id_produto: p.id,
        produto: p.produto,
        un_medida: (p.un_medida ?? "UN").trim() || "UN",
        preco: precoBase(p),
        quantidade: 1,
      },
    ]);
  };

  const alterarQuantidade = (id: string, qtd: number) => {
    setItens((prev) =>
      prev.map((i) =>
        i.id_produto === id ? { ...i, quantidade: qtd } : i,
      ),
    );
  };

  const removerItem = (id: string) => {
    setItens((prev) => prev.filter((i) => i.id_produto !== id));
  };

  const total = itens.reduce(
    (s, i) => s + i.preco * (Number.isFinite(i.quantidade) ? i.quantidade : 0),
    0,
  );

  const setDestCampo = (campo: keyof typeof DEST_VAZIO, valor: string) => {
    setDest((prev) => ({ ...prev, [campo]: valor }));
  };

  const emitir = useCallback(async () => {
    setErro(null);
    setResultado(null);

    if (itens.length === 0) {
      setErro("Adicione ao menos um produto à nota.");
      return;
    }
    for (const i of itens) {
      if (!Number.isFinite(i.quantidade) || i.quantidade <= 0) {
        setErro(`Quantidade inválida para "${i.produto}".`);
        return;
      }
    }

    const doc = dest.documento.replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14) {
      setErro("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) do destinatário.");
      return;
    }

    const destinatario: Record<string, string> = {
      x_nome: dest.x_nome.trim(),
      x_lgr: dest.x_lgr.trim(),
      nro: dest.nro.trim(),
      x_bairro: dest.x_bairro.trim(),
      c_mun: dest.c_mun.replace(/\D/g, ""),
      x_mun: dest.x_mun.trim(),
      uf: dest.uf.trim().toUpperCase(),
      cep: dest.cep.replace(/\D/g, ""),
    };
    if (doc.length === 11) destinatario.cpf = doc;
    else destinatario.cnpj = doc;

    setEnviando(true);
    try {
      const res = await fetch("/api/nfe/emitir-produto", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          natureza_operacao: naturezaOperacao.trim() || "VENDA DE MERCADORIA",
          destinatario,
          itens: itens.map((i) => ({
            id_produto: i.id_produto,
            quantidade: i.quantidade,
          })),
        }),
      });
      const j = (await res.json()) as EmissaoResposta;
      if (!res.ok) {
        setErro(j.error ?? "Falha ao emitir a nota.");
        setResultado(j);
        return;
      }
      setResultado(j);
      onEmitido();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao emitir a nota.");
    } finally {
      setEnviando(false);
    }
  }, [itens, dest, naturezaOperacao, onEmitido]);

  if (!aberto) return null;

  const autorizada = resultado?.ok === true;

  return (
    <div
      className="modal fade show"
      style={{ display: "block", background: "rgba(0,0,0,0.5)" }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="fas fa-file-invoice mr-2" aria-hidden />
              Emitir nota de produto
            </h5>
            <button
              type="button"
              className="close"
              aria-label="Fechar"
              onClick={onFechar}
            >
              <span aria-hidden>&times;</span>
            </button>
          </div>

          <div className="modal-body">
            {resultado ? (
              <div
                className={`alert ${autorizada ? "alert-success" : "alert-danger"}`}
                role="alert"
              >
                {autorizada ? (
                  <>
                    <i className="fas fa-check-circle mr-1" aria-hidden />
                    Nota autorizada! Nº {resultado.nNF} / série {resultado.serie}.
                    {resultado.protocolo ? (
                      <div className="small mt-1">
                        Protocolo: {resultado.protocolo}
                      </div>
                    ) : null}
                    {resultado.chave ? (
                      <div className="small text-monospace mt-1" style={{ wordBreak: "break-all" }}>
                        {resultado.chave}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <i className="fas fa-exclamation-triangle mr-1" aria-hidden />
                    {erro ?? resultado.xMotivo ?? "A SEFAZ rejeitou a nota."}
                    {resultado.cStatProt || resultado.cStatLote ? (
                      <div className="small mt-1">
                        cStat {resultado.cStatProt ?? resultado.cStatLote}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {erro && !resultado ? (
              <div className="alert alert-danger" role="alert">
                {erro}
              </div>
            ) : null}

            {!autorizada ? (
              <>
                <div className="form-group">
                  <label htmlFor="nfce-busca-produto">Adicionar produto</label>
                  <input
                    id="nfce-busca-produto"
                    type="search"
                    className="form-control"
                    placeholder="Buscar por nome ou SKU"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    disabled={carregandoProdutos}
                  />
                  {carregandoProdutos ? (
                    <small className="text-muted">Carregando produtos…</small>
                  ) : produtosFiltrados.length > 0 ? (
                    <div
                      className="list-group mt-1"
                      style={{ maxHeight: "180px", overflowY: "auto" }}
                    >
                      {produtosFiltrados.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          className="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-1"
                          onClick={() => adicionarItem(p)}
                        >
                          <span>
                            {p.produto}
                            {p.sku ? (
                              <span className="text-muted small"> · {p.sku}</span>
                            ) : null}
                          </span>
                          <span className="text-muted small">
                            {fmtBrl(precoBase(p))}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : busca.trim().length > 0 ? (
                    <small className="text-muted">Nenhum produto encontrado.</small>
                  ) : null}
                </div>

                <div className="table-responsive">
                  <table className="table table-sm table-bordered mb-2">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th style={{ width: "110px" }}>Qtd.</th>
                        <th className="text-right" style={{ width: "120px" }}>
                          Unitário
                        </th>
                        <th className="text-right" style={{ width: "120px" }}>
                          Subtotal
                        </th>
                        <th style={{ width: "44px" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {itens.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center text-muted py-3">
                            Nenhum produto adicionado.
                          </td>
                        </tr>
                      ) : (
                        itens.map((i) => (
                          <tr key={i.id_produto}>
                            <td>
                              {i.produto}
                              <span className="text-muted small"> ({i.un_medida})</span>
                            </td>
                            <td>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                className="form-control form-control-sm"
                                value={i.quantidade}
                                onChange={(e) =>
                                  alterarQuantidade(
                                    i.id_produto,
                                    Number.parseInt(e.target.value, 10),
                                  )
                                }
                              />
                            </td>
                            <td className="text-right align-middle">
                              {fmtBrl(i.preco)}
                            </td>
                            <td className="text-right align-middle">
                              {fmtBrl(
                                i.preco *
                                  (Number.isFinite(i.quantidade)
                                    ? i.quantidade
                                    : 0),
                              )}
                            </td>
                            <td className="text-center align-middle">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                aria-label={`Remover ${i.produto}`}
                                onClick={() => removerItem(i.id_produto)}
                              >
                                <i className="fas fa-trash" aria-hidden />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {itens.length > 0 ? (
                      <tfoot>
                        <tr>
                          <td colSpan={3} className="text-right font-weight-bold">
                            Total
                          </td>
                          <td className="text-right font-weight-bold">
                            {fmtBrl(total)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>

                <hr />
                <h6 className="mb-2">Destinatário</h6>
                <div className="row">
                  <div className="col-12 col-md-4">
                    <div className="form-group">
                      <label htmlFor="nfce-dest-doc">CPF ou CNPJ</label>
                      <input
                        id="nfce-dest-doc"
                        type="text"
                        className="form-control"
                        value={dest.documento}
                        onChange={(e) => setDestCampo("documento", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-12 col-md-8">
                    <div className="form-group">
                      <label htmlFor="nfce-dest-nome">Nome / Razão social</label>
                      <input
                        id="nfce-dest-nome"
                        type="text"
                        className="form-control"
                        value={dest.x_nome}
                        onChange={(e) => setDestCampo("x_nome", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-12 col-md-8">
                    <div className="form-group">
                      <label htmlFor="nfce-dest-lgr">Logradouro</label>
                      <input
                        id="nfce-dest-lgr"
                        type="text"
                        className="form-control"
                        value={dest.x_lgr}
                        onChange={(e) => setDestCampo("x_lgr", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-6 col-md-4">
                    <div className="form-group">
                      <label htmlFor="nfce-dest-nro">Número</label>
                      <input
                        id="nfce-dest-nro"
                        type="text"
                        className="form-control"
                        value={dest.nro}
                        onChange={(e) => setDestCampo("nro", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-6 col-md-4">
                    <div className="form-group">
                      <label htmlFor="nfce-dest-bairro">Bairro</label>
                      <input
                        id="nfce-dest-bairro"
                        type="text"
                        className="form-control"
                        value={dest.x_bairro}
                        onChange={(e) => setDestCampo("x_bairro", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-6 col-md-4">
                    <div className="form-group">
                      <label htmlFor="nfce-dest-cmun">Cód. município (IBGE)</label>
                      <input
                        id="nfce-dest-cmun"
                        type="text"
                        className="form-control"
                        placeholder="7 dígitos"
                        value={dest.c_mun}
                        onChange={(e) => setDestCampo("c_mun", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-6 col-md-4">
                    <div className="form-group">
                      <label htmlFor="nfce-dest-mun">Município</label>
                      <input
                        id="nfce-dest-mun"
                        type="text"
                        className="form-control"
                        value={dest.x_mun}
                        onChange={(e) => setDestCampo("x_mun", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-6 col-md-2">
                    <div className="form-group">
                      <label htmlFor="nfce-dest-uf">UF</label>
                      <input
                        id="nfce-dest-uf"
                        type="text"
                        maxLength={2}
                        className="form-control text-uppercase"
                        value={dest.uf}
                        onChange={(e) => setDestCampo("uf", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-6 col-md-2">
                    <div className="form-group">
                      <label htmlFor="nfce-dest-cep">CEP</label>
                      <input
                        id="nfce-dest-cep"
                        type="text"
                        className="form-control"
                        value={dest.cep}
                        onChange={(e) => setDestCampo("cep", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-12">
                    <div className="form-group mb-0">
                      <label htmlFor="nfce-natop">Natureza da operação</label>
                      <input
                        id="nfce-natop"
                        type="text"
                        className="form-control"
                        value={naturezaOperacao}
                        onChange={(e) => setNaturezaOperacao(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <p className="text-muted small mt-2 mb-0">
                  Esta emissão usa NF-e modelo 55 de mercadoria, nacional e na
                  mesma UF do emitente.
                </p>
              </>
            ) : null}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onFechar}
              disabled={enviando}
            >
              {autorizada ? "Fechar" : "Cancelar"}
            </button>
            {!autorizada ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void emitir()}
                disabled={enviando || itens.length === 0}
              >
                {enviando ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm mr-2 align-middle"
                      role="status"
                      aria-hidden
                    />
                    Emitindo…
                  </>
                ) : (
                  "Emitir nota"
                )}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
