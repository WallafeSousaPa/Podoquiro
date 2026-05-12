"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export type NfeEmissaoProdutoRow = {
  id: string;
  ambiente: number;
  serie: number;
  numero_nf: number | null;
  status: string;
  chave_acesso: string | null;
  protocolo_autorizacao: string | null;
  c_stat: string | null;
  x_motivo: string | null;
  created_at: string;
  updated_at: string;
};

type ProdutoMercadoria = {
  id: string;
  produto: string;
  sku: string | null;
  preco: number;
  preco_venda: number | null;
  ncm: string;
  un_medida: string;
};

type LinhaCarrinho = {
  id: string;
  produto: string;
  quantidade: number;
  precoUnit: number;
};

function labelAmbiente(a: number) {
  if (a === 1) return "Produção";
  if (a === 2) return "Homologação";
  return String(a);
}

function badgeStatus(status: string) {
  switch (status) {
    case "autorizada":
      return "badge-success";
    case "rejeitada":
    case "denegada":
      return "badge-danger";
    case "transmitida":
    case "assinada":
      return "badge-info";
    case "rascunho":
      return "badge-secondary";
    case "cancelada":
      return "badge-dark";
    default:
      return "badge-light";
  }
}

type Props = {
  rows: NfeEmissaoProdutoRow[];
  loadError?: string | null;
};

export function NfeNotasProdutoClient({ rows, loadError }: Props) {
  const router = useRouter();
  const [produtos, setProdutos] = useState<ProdutoMercadoria[]>([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(true);
  const [produtosErr, setProdutosErr] = useState<string | null>(null);
  const [idSelecionado, setIdSelecionado] = useState("");
  const [qtdNova, setQtdNova] = useState("1");
  const [carrinho, setCarrinho] = useState<LinhaCarrinho[]>([]);

  const [docTipo, setDocTipo] = useState<"cpf" | "cnpj">("cpf");
  const [cpf, setCpf] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [xNome, setXNome] = useState("");
  const [xLgr, setXLgr] = useState("");
  const [nro, setNro] = useState("");
  const [xBairro, setXBairro] = useState("");
  const [cMun, setCMun] = useState("");
  const [xMun, setXMun] = useState("");
  const [uf, setUf] = useState("PA");
  const [cep, setCep] = useState("");
  const [natOp, setNatOp] = useState("VENDA DE MERCADORIA");

  const [emitindo, setEmitindo] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const carregarProdutos = useCallback(async () => {
    setCarregandoProdutos(true);
    setProdutosErr(null);
    try {
      const res = await fetch("/api/produtos?tipo=mercadoria&status=ativo");
      const json = (await res.json().catch(() => ({}))) as {
        data?: ProdutoMercadoria[];
        error?: string;
      };
      if (!res.ok) {
        setProdutosErr(json.error ?? "Falha ao listar produtos.");
        setProdutos([]);
        return;
      }
      setProdutos(json.data ?? []);
    } catch {
      setProdutosErr("Erro de rede ao carregar produtos.");
      setProdutos([]);
    } finally {
      setCarregandoProdutos(false);
    }
  }, []);

  useEffect(() => {
    void carregarProdutos();
  }, [carregarProdutos]);

  const totalNota = useMemo(
    () => carrinho.reduce((s, l) => s + l.quantidade * l.precoUnit, 0),
    [carrinho],
  );

  function precoExibicao(p: ProdutoMercadoria): number {
    if (p.preco_venda != null && Number(p.preco_venda) >= 0) return Number(p.preco_venda);
    return Number(p.preco);
  }

  function adicionarAoCarrinho() {
    setMsg(null);
    const p = produtos.find((x) => x.id === idSelecionado);
    if (!p) {
      setMsg({ ok: false, texto: "Selecione um produto." });
      return;
    }
    const q = Number(String(qtdNova).replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) {
      setMsg({ ok: false, texto: "Quantidade inválida." });
      return;
    }
    const precoUnit = precoExibicao(p);
    setCarrinho((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i]!, quantidade: next[i]!.quantidade + q };
        return next;
      }
      return [
        ...prev,
        { id: p.id, produto: p.produto, quantidade: q, precoUnit },
      ];
    });
  }

  function removerLinha(id: string) {
    setCarrinho((prev) => prev.filter((x) => x.id !== id));
  }

  async function emitir() {
    setEmitindo(true);
    setMsg(null);
    if (carrinho.length === 0) {
      setMsg({ ok: false, texto: "Inclua ao menos um produto na nota." });
      setEmitindo(false);
      return;
    }
    const destinatario: Record<string, string> = {
      x_nome: xNome.trim(),
      x_lgr: xLgr.trim(),
      nro: nro.trim(),
      x_bairro: xBairro.trim(),
      c_mun: cMun.replace(/\D/g, ""),
      x_mun: xMun.trim(),
      uf: uf.trim().toUpperCase(),
      cep: cep.replace(/\D/g, ""),
    };
    if (docTipo === "cpf") destinatario.cpf = cpf.replace(/\D/g, "");
    else destinatario.cnpj = cnpj.replace(/\D/g, "");

    try {
      const res = await fetch("/api/nfe/emitir-produto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itens: carrinho.map((l) => ({ id_produto: l.id, quantidade: l.quantidade })),
          destinatario,
          natureza_operacao: natOp.trim() || "VENDA DE MERCADORIA",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        cStatProt?: string | null;
        cStatLote?: string | null;
        xMotivo?: string | null;
        chave?: string;
        nNF?: number;
      };
      if (!res.ok) {
        setMsg({ ok: false, texto: json.error ?? "Falha ao emitir." });
        return;
      }
      const stat = json.cStatProt ?? json.cStatLote;
      const detalhe = [stat, json.xMotivo, json.chave ? `Chave ${json.chave}` : ""]
        .filter(Boolean)
        .join(" — ");
      setMsg({
        ok: Boolean(json.ok),
        texto: detalhe || "Processamento concluído.",
      });
      if (json.ok) {
        setCarrinho([]);
      }
      router.refresh();
    } catch {
      setMsg({ ok: false, texto: "Erro de rede ao emitir NF-e." });
    } finally {
      setEmitindo(false);
    }
  }

  if (loadError) {
    return (
      <div className="alert alert-danger" role="alert">
        {loadError}
        <p className="mb-0 mt-2 small">
          Se a mensagem citar coluna `escopo_emissao`, aplique a migração Supabase mais recente
          (`nfe_emissoes_escopo`).
        </p>
      </div>
    );
  }

  return (
    <div className="row">
      <div className="col-lg-7 mb-3">
        <div className="card card-outline card-success">
          <div className="card-header">
            <h3 className="card-title mb-0">Nova NF-e de produto (nacional, mesma UF)</h3>
          </div>
          <div className="card-body">
            <p className="text-muted small">
              Mercadorias do cadastro de estoque (não serviços). Ambiente conforme{" "}
              <code>NFE_AMBIENTE</code> no servidor. Em homologação, o nome do destinatário na nota é
              fixo (exigência SEFAZ).
            </p>

            <h5 className="text-secondary">Itens</h5>
            {produtosErr ? (
              <div className="alert alert-warning py-2 small">{produtosErr}</div>
            ) : null}
            <div className="form-row align-items-end">
              <div className="form-group col-md-6">
                <label htmlFor="nfp-produto">Produto</label>
                <select
                  id="nfp-produto"
                  className="form-control form-control-sm"
                  disabled={carregandoProdutos}
                  value={idSelecionado}
                  onChange={(e) => setIdSelecionado(e.target.value)}
                >
                  <option value="">
                    {carregandoProdutos ? "Carregando…" : "Selecione…"}
                  </option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.produto} — {precoExibicao(p).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group col-md-3">
                <label htmlFor="nfp-qtd">Qtd.</label>
                <input
                  id="nfp-qtd"
                  type="text"
                  className="form-control form-control-sm"
                  inputMode="decimal"
                  value={qtdNova}
                  onChange={(e) => setQtdNova(e.target.value)}
                />
              </div>
              <div className="form-group col-md-3">
                <button
                  type="button"
                  className="btn btn-outline-success btn-sm btn-block"
                  onClick={() => adicionarAoCarrinho()}
                >
                  Adicionar
                </button>
              </div>
            </div>

            {carrinho.length > 0 ? (
              <ul className="list-group list-group-flush mb-3 small">
                {carrinho.map((l) => (
                  <li
                    key={l.id}
                    className="list-group-item d-flex justify-content-between align-items-center px-0"
                  >
                    <span>
                      {l.produto}{" "}
                      <span className="text-muted">
                        × {l.quantidade} @{" "}
                        {l.precoUnit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-link btn-sm text-danger p-0"
                      onClick={() => removerLinha(l.id)}
                    >
                      remover
                    </button>
                  </li>
                ))}
                <li className="list-group-item px-0 font-weight-bold">
                  Total: {totalNota.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </li>
              </ul>
            ) : (
              <p className="text-muted small">Nenhum item na nota.</p>
            )}

            <h5 className="text-secondary mt-3">Destinatário</h5>
            <div className="form-group">
              <div className="btn-group btn-group-sm mb-2">
                <button
                  type="button"
                  className={`btn ${docTipo === "cpf" ? "btn-primary" : "btn-outline-primary"}`}
                  onClick={() => setDocTipo("cpf")}
                >
                  CPF
                </button>
                <button
                  type="button"
                  className={`btn ${docTipo === "cnpj" ? "btn-primary" : "btn-outline-primary"}`}
                  onClick={() => setDocTipo("cnpj")}
                >
                  CNPJ
                </button>
              </div>
            </div>
            <div className="form-row">
              {docTipo === "cpf" ? (
                <div className="form-group col-md-4">
                  <label htmlFor="nfp-cpf">CPF</label>
                  <input
                    id="nfp-cpf"
                    className="form-control form-control-sm"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    placeholder="000.000.000-00"
                  />
                </div>
              ) : (
                <div className="form-group col-md-4">
                  <label htmlFor="nfp-cnpj">CNPJ</label>
                  <input
                    id="nfp-cnpj"
                    className="form-control form-control-sm"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                  />
                </div>
              )}
              <div className="form-group col-md-8">
                <label htmlFor="nfp-nome">Nome / razão social</label>
                <input
                  id="nfp-nome"
                  className="form-control form-control-sm"
                  value={xNome}
                  onChange={(e) => setXNome(e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group col-md-8">
                <label htmlFor="nfp-lgr">Logradouro</label>
                <input
                  id="nfp-lgr"
                  className="form-control form-control-sm"
                  value={xLgr}
                  onChange={(e) => setXLgr(e.target.value)}
                />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="nfp-nro">Número</label>
                <input
                  id="nfp-nro"
                  className="form-control form-control-sm"
                  value={nro}
                  onChange={(e) => setNro(e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group col-md-4">
                <label htmlFor="nfp-bairro">Bairro</label>
                <input
                  id="nfp-bairro"
                  className="form-control form-control-sm"
                  value={xBairro}
                  onChange={(e) => setXBairro(e.target.value)}
                />
              </div>
              <div className="form-group col-md-3">
                <label htmlFor="nfp-cmun">Município (IBGE)</label>
                <input
                  id="nfp-cmun"
                  className="form-control form-control-sm"
                  value={cMun}
                  onChange={(e) => setCMun(e.target.value)}
                  placeholder="7 dígitos"
                />
              </div>
              <div className="form-group col-md-3">
                <label htmlFor="nfp-xmun">Município (nome)</label>
                <input
                  id="nfp-xmun"
                  className="form-control form-control-sm"
                  value={xMun}
                  onChange={(e) => setXMun(e.target.value)}
                />
              </div>
              <div className="form-group col-md-2">
                <label htmlFor="nfp-uf">UF</label>
                <input
                  id="nfp-uf"
                  className="form-control form-control-sm"
                  maxLength={2}
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                />
              </div>
              <div className="form-group col-md-2">
                <label htmlFor="nfp-cep">CEP</label>
                <input
                  id="nfp-cep"
                  className="form-control form-control-sm"
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="nfp-natop">Natureza da operação</label>
              <input
                id="nfp-natop"
                className="form-control form-control-sm"
                value={natOp}
                onChange={(e) => setNatOp(e.target.value)}
                maxLength={60}
              />
            </div>

            {msg ? (
              <div
                className={`alert ${msg.ok ? "alert-success" : "alert-warning"} small py-2`}
                role="status"
              >
                {msg.texto}
              </div>
            ) : null}

            <button
              type="button"
              className="btn btn-success"
              disabled={emitindo || carrinho.length === 0}
              onClick={() => void emitir()}
            >
              {emitindo ? "Transmitindo…" : "Emitir NF-e de produto"}
            </button>
          </div>
        </div>
      </div>

      <div className="col-lg-5 mb-3">
        <div className="card card-outline card-secondary">
          <div className="card-header">
            <h3 className="card-title mb-0">Histórico (produto)</h3>
          </div>
          <div className="card-body table-responsive p-0">
            <table className="table table-hover table-striped mb-0 table-sm">
              <thead>
                <tr>
                  <th>Amb.</th>
                  <th>Sér.</th>
                  <th>Nº</th>
                  <th>Status</th>
                  <th>Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-3 small">
                      Nenhuma NF-e de produto ainda.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="small">{labelAmbiente(row.ambiente)}</td>
                      <td>{row.serie}</td>
                      <td>{row.numero_nf ?? "—"}</td>
                      <td>
                        <span className={`badge ${badgeStatus(row.status)}`}>{row.status}</span>
                      </td>
                      <td className="small text-muted">
                        {new Date(row.updated_at).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
