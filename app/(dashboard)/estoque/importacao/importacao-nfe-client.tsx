"use client";

import { formatarCnpjCpf } from "@/lib/estoque/parse-nfe-xml";
import type { ImportacaoPreview } from "@/lib/estoque/preview-nfe-importacao";
import { chaveAgrupamentoNfe } from "@/lib/estoque/vincular-produtos-nfe";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

export type EmpresaListaItem = {
  id: number;
  nome_fantasia: string | null;
};

type ListaRow = {
  id: string;
  id_empresa?: number;
  chave_acesso: string;
  numero_nf: number;
  serie: number;
  dh_emissao: string | null;
  emit_nome: string | null;
  emit_cnpj: string | null;
  dest_nome: string | null;
  valor_nf: number;
  status: "pendente" | "entrada_realizada";
  entrada_em: string | null;
  created_at: string;
};

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

function qtdLabel(n: number) {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function nomeEmpresaLabel(empresas: EmpresaListaItem[], id: number) {
  const e = empresas.find((x) => x.id === id);
  const n = e?.nome_fantasia?.trim();
  return n || `Empresa #${id}`;
}

type Props = {
  empresas: EmpresaListaItem[];
  empresaIdPadrao: number;
  loadError?: string | null;
  podeExcluir?: boolean;
};

export function ImportacaoNfeClient({
  empresas,
  empresaIdPadrao,
  loadError,
  podeExcluir = false,
}: Props) {
  const fileId = useId();
  const empresaSelectId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [empresaId, setEmpresaId] = useState(() => String(empresaIdPadrao));
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [carregandoXml, setCarregandoXml] = useState(false);
  const [dandoEntrada, setDandoEntrada] = useState(false);
  const [preview, setPreview] = useState<ImportacaoPreview | null>(null);
  const [lista, setLista] = useState<ListaRow[]>([]);
  const [listaLoading, setListaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [confirmEntrada, setConfirmEntrada] = useState(false);
  const [confirmExcluir, setConfirmExcluir] = useState<{
    id: string;
    numero_nf: number;
    status: "pendente" | "entrada_realizada";
  } | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [qtdEditada, setQtdEditada] = useState<Record<string, number>>({});

  useEffect(() => {
    setEmpresaId(String(empresaIdPadrao));
  }, [empresaIdPadrao]);

  const empresaIdNum = Number(empresaId) || empresaIdPadrao;
  const nomeEmpresaSelecionada = nomeEmpresaLabel(empresas, empresaIdNum);

  const carregarLista = useCallback(async () => {
    setListaLoading(true);
    try {
      const qs = new URLSearchParams({ id_empresa: String(empresaIdNum) });
      const res = await fetch(`/api/estoque/importacao?${qs.toString()}`, {
        credentials: "include",
      });
      const j = (await res.json()) as { data?: ListaRow[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao listar importações.");
      setLista(j.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao listar importações.");
    } finally {
      setListaLoading(false);
    }
  }, [empresaIdNum]);

  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);

  async function enviarXml(xml: string) {
    setCarregandoXml(true);
    setError(null);
    setSucesso(null);
    try {
      const res = await fetch("/api/estoque/importacao", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xml, id_empresa: empresaIdNum }),
      });
      const j = (await res.json()) as {
        data?: ImportacaoPreview;
        error?: string;
        id?: string;
      };
      if (res.status === 409 && j.id) {
        setError(j.error ?? "Esta NF-e já teve entrada.");
        await abrirNota(j.id);
        return;
      }
      if (!res.ok) throw new Error(j.error ?? "Falha ao importar o XML.");
      if (!j.data) throw new Error("Resposta sem dados da nota.");
      setPreview(j.data);
      await carregarLista();
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Falha ao importar o XML.");
    } finally {
      setCarregandoXml(false);
    }
  }

  async function aoEscolherArquivo(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setArquivoNome(file.name);
    const xml = await file.text();
    await enviarXml(xml);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function abrirNota(id: string) {
    setError(null);
    setSucesso(null);
    setCarregandoXml(true);
    try {
      const res = await fetch(`/api/estoque/importacao/${id}`, { credentials: "include" });
      const j = (await res.json()) as { data?: ImportacaoPreview; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível abrir a nota.");
      if (!j.data) throw new Error("Nota sem dados.");
      setPreview(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível abrir a nota.");
    } finally {
      setCarregandoXml(false);
    }
  }

  async function confirmarEntrada() {
    if (!preview || preview.status !== "pendente") return;
    const quantidades: Record<string, number> = {};
    for (const it of preview.itens) {
      const v = qtdEditada[it.id];
      quantidades[it.id] =
        typeof v === "number" && Number.isFinite(v) && v >= 0
          ? Math.round(v)
          : Math.max(0, Math.round(Number(it.q_com)) || 0);
    }
    if (Object.values(quantidades).every((q) => q <= 0)) {
      setError("Informe a quantidade de ao menos um produto para dar entrada.");
      setConfirmEntrada(false);
      return;
    }
    setDandoEntrada(true);
    setError(null);
    setSucesso(null);
    try {
      const res = await fetch(`/api/estoque/importacao/${preview.id}/entrada`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantidades }),
      });
      const j = (await res.json()) as {
        data?: ImportacaoPreview;
        resultado?: { cadastrados: number; atualizados: number; unidades: number };
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Falha ao dar entrada.");
      if (j.data) setPreview(j.data);
      const r = j.resultado;
      if (r) {
        const partes: string[] = [];
        if (r.atualizados > 0) {
          partes.push(
            `${r.atualizados} produto${r.atualizados === 1 ? "" : "s"} com estoque atualizado`,
          );
        }
        if (r.cadastrados > 0) {
          partes.push(
            `${r.cadastrados} produto${r.cadastrados === 1 ? "" : "s"} cadastrado${r.cadastrados === 1 ? "" : "s"}`,
          );
        }
        setSucesso(
          `Entrada realizada: ${partes.join(" e ") || "nenhuma alteração"}. ${r.unidades} unidade${r.unidades === 1 ? "" : "s"} somadas ao estoque.`,
        );
      } else {
        setSucesso("Entrada realizada no estoque.");
      }
      await carregarLista();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao dar entrada.");
    } finally {
      setDandoEntrada(false);
      setConfirmEntrada(false);
    }
  }

  async function confirmarExclusao() {
    if (!podeExcluir || !confirmExcluir) return;
    setExcluindo(true);
    setError(null);
    setSucesso(null);
    try {
      const res = await fetch(`/api/estoque/importacao/${confirmExcluir.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        revertida?: boolean;
        reversao?: { revertidos: number; unidades: number } | null;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Falha ao excluir a importação.");

      if (preview?.id === confirmExcluir.id) {
        setPreview(null);
      }

      if (j.revertida && j.reversao) {
        setSucesso(
          `Importação da NF-e ${confirmExcluir.numero_nf} excluída. Estoque revertido em ${j.reversao.unidades} unidade(s) de ${j.reversao.revertidos} produto(s).`,
        );
      } else {
        setSucesso(`Importação da NF-e ${confirmExcluir.numero_nf} excluída.`);
      }
      await carregarLista();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir a importação.");
    } finally {
      setExcluindo(false);
      setConfirmExcluir(null);
    }
  }

  const pendente = preview?.status === "pendente";

  useEffect(() => {
    if (!preview) {
      setQtdEditada({});
      return;
    }
    const next: Record<string, number> = {};
    for (const it of preview.itens) {
      next[it.id] = Math.max(0, Math.round(Number(it.q_com)) || 0);
    }
    setQtdEditada(next);
  }, [preview]);

  const qtdDe = useCallback(
    (itemId: string, qCom: number) => {
      const v = qtdEditada[itemId];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v);
      return Math.max(0, Math.round(Number(qCom)) || 0);
    },
    [qtdEditada],
  );

  const estoqueAposPorItem = useMemo(() => {
    const out = new Map<string, number>();
    if (!preview || preview.status !== "pendente") return out;
    const somaGrupo = new Map<string, number>();
    const chaveDe = (item: (typeof preview.itens)[number]) =>
      item.produto_existente?.id
        ? `id:${item.produto_existente.id}`
        : `novo:${chaveAgrupamentoNfe({ cEan: item.c_ean, xProd: item.x_prod })}`;
    for (const item of preview.itens) {
      const k = chaveDe(item);
      somaGrupo.set(k, (somaGrupo.get(k) ?? 0) + qtdDe(item.id, item.q_com));
    }
    for (const item of preview.itens) {
      const k = chaveDe(item);
      const totalGrupo = somaGrupo.get(k) ?? 0;
      const atual = item.produto_existente?.qtd_estoque ?? 0;
      out.set(item.id, item.produto_existente ? atual + totalGrupo : totalGrupo);
    }
    return out;
  }, [preview, qtdDe]);

  const unidadesEntrada = useMemo(() => {
    if (!preview) return 0;
    return preview.itens.reduce((s, it) => s + qtdDe(it.id, it.q_com), 0);
  }, [preview, qtdDe]);

  const resumoEntrada = useMemo(() => {
    if (!preview) return { atualizar: 0, cadastrar: 0, ignorados: 0 };
    const grupos = new Map<string, { existente: boolean; qtd: number }>();
    const chaveDe = (item: (typeof preview.itens)[number]) =>
      item.produto_existente?.id
        ? `id:${item.produto_existente.id}`
        : `novo:${chaveAgrupamentoNfe({ cEan: item.c_ean, xProd: item.x_prod })}`;
    let ignorados = 0;
    for (const item of preview.itens) {
      const q = qtdDe(item.id, item.q_com);
      if (q <= 0) ignorados += 1;
      const k = chaveDe(item);
      const g = grupos.get(k);
      if (g) g.qtd += q;
      else grupos.set(k, { existente: Boolean(item.produto_existente), qtd: q });
    }
    let atualizar = 0;
    let cadastrar = 0;
    for (const g of grupos.values()) {
      if (g.qtd <= 0) continue;
      if (g.existente) atualizar += 1;
      else cadastrar += 1;
    }
    return { atualizar, cadastrar, ignorados };
  }, [preview, qtdDe]);

  return (
    <>
      <div className="card card-outline card-primary mb-3">
        <div className="card-header">
          <h3 className="card-title mb-0">Arquivo XML da NF-e</h3>
        </div>
        <div className="card-body">
          <p className="text-muted small mb-3">
            Selecione a empresa que receberá a entrada no estoque. Envie o XML da nota
            de compra (modelo 55). Os produtos serão conferidos com o cadastro dessa
            empresa (código de barras e nome). Ajuste a quantidade de cada item se
            precisar; na entrada, esse valor é <strong>somado</strong> ao estoque atual.
            Se houver 2 unidades e você confirmar 4, o estoque passa a 6. Itens que ainda
            não existem são cadastrados nessa empresa.
          </p>
          {loadError ? (
            <div className="alert alert-warning py-2 small" role="alert">
              {loadError}
            </div>
          ) : null}
          <div className="form-group">
            <label htmlFor={empresaSelectId}>Empresa</label>
            <select
              id={empresaSelectId}
              className="form-control"
              value={empresaId}
              disabled={carregandoXml || dandoEntrada || excluindo}
              onChange={(e) => {
                setEmpresaId(e.target.value);
                setPreview(null);
                setSucesso(null);
                setError(null);
                setArquivoNome(null);
              }}
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
          <div className="form-group mb-0">
            <label htmlFor={fileId}>Selecionar XML</label>
            <input
              ref={fileRef}
              id={fileId}
              type="file"
              accept=".xml,text/xml,application/xml"
              className="form-control-file"
              disabled={carregandoXml || dandoEntrada || excluindo}
              onChange={(e) => void aoEscolherArquivo(e.target.files)}
            />
            {arquivoNome ? (
              <span className="small text-muted d-block mt-1">{arquivoNome}</span>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {sucesso ? (
        <div className="alert alert-success" role="alert">
          {sucesso}
        </div>
      ) : null}
      {carregandoXml ? (
        <div className="alert alert-info" role="status">
          Lendo a nota fiscal…
        </div>
      ) : null}

      {preview ? (
        <>
          <div className="row">
            <div className="col-md-6">
              <div className="card card-outline card-secondary">
                <div className="card-header">
                  <h3 className="card-title mb-0">Emitente</h3>
                </div>
                <div className="card-body py-2">
                  <dl className="row mb-0 small">
                    <dt className="col-sm-4">Razão social</dt>
                    <dd className="col-sm-8">{preview.emitente.nome || "—"}</dd>
                    <dt className="col-sm-4">Fantasia</dt>
                    <dd className="col-sm-8">{preview.emitente.fantasia || "—"}</dd>
                    <dt className="col-sm-4">CNPJ</dt>
                    <dd className="col-sm-8">
                      {formatarCnpjCpf(preview.emitente.cnpj, "CNPJ")}
                    </dd>
                    <dt className="col-sm-4">IE</dt>
                    <dd className="col-sm-8">{preview.emitente.ie || "—"}</dd>
                    <dt className="col-sm-4">Endereço</dt>
                    <dd className="col-sm-8">{preview.emitente.endereco || "—"}</dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="card card-outline card-secondary">
                <div className="card-header">
                  <h3 className="card-title mb-0">Destinatário</h3>
                </div>
                <div className="card-body py-2">
                  <dl className="row mb-0 small">
                    <dt className="col-sm-4">Nome</dt>
                    <dd className="col-sm-8">{preview.destinatario.nome || "—"}</dd>
                    <dt className="col-sm-4">Documento</dt>
                    <dd className="col-sm-8">
                      {formatarCnpjCpf(
                        preview.destinatario.doc,
                        preview.destinatario.tipo,
                      )}
                    </dd>
                    <dt className="col-sm-4">E-mail</dt>
                    <dd className="col-sm-8">{preview.destinatario.email || "—"}</dd>
                    <dt className="col-sm-4">Endereço</dt>
                    <dd className="col-sm-8">{preview.destinatario.endereco || "—"}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="card card-outline card-info mb-3">
            <div className="card-body py-3">
              <div className="row align-items-center">
                <div className="col-md-8">
                  <p className="mb-1">
                    <strong>NF-e {preview.numero_nf}</strong>
                    <span className="text-muted"> série {preview.serie}</span>
                    {preview.status === "entrada_realizada" ? (
                      <span className="badge badge-success ml-2">Entrada realizada</span>
                    ) : (
                      <span className="badge badge-warning ml-2">Pendente de entrada</span>
                    )}
                  </p>
                  <p className="small text-muted mb-1">
                    Emissão: {formatDataHora(preview.dh_emissao)}
                    {preview.natureza_operacao ? ` · ${preview.natureza_operacao}` : ""}
                    {" · "}
                    Estoque: {nomeEmpresaLabel(empresas, preview.id_empresa)}
                  </p>
                  <p className="small text-muted mb-0">
                    Chave: <code>{preview.chave_acesso}</code>
                  </p>
                </div>
                <div className="col-md-4 text-md-right mt-2 mt-md-0">
                  <div className="small">Produtos: {formatBRL(preview.totais.valor_produtos)}</div>
                  <div className="small">Frete: {formatBRL(preview.totais.valor_frete)}</div>
                  <div>
                    <strong>Total da nota: {formatBRL(preview.totais.valor_nf)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card card-outline card-primary">
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center">
              <h3 className="card-title mb-2 mb-sm-0">Produtos da nota</h3>
              <div className="d-flex flex-wrap" style={{ gap: "0.5rem" }}>
                {podeExcluir ? (
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    disabled={excluindo || dandoEntrada}
                    onClick={() =>
                      setConfirmExcluir({
                        id: preview.id,
                        numero_nf: preview.numero_nf,
                        status: preview.status,
                      })
                    }
                  >
                    <i className="fas fa-trash-alt mr-1" aria-hidden />
                    Excluir importação
                  </button>
                ) : null}
                {pendente ? (
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    disabled={
                      dandoEntrada ||
                      excluindo ||
                      preview.itens.length === 0 ||
                      unidadesEntrada <= 0
                    }
                    onClick={() => setConfirmEntrada(true)}
                  >
                    <i className="fas fa-boxes mr-1" aria-hidden />
                    Dar entrada no estoque
                  </button>
                ) : null}
              </div>
            </div>
            <div className="card-body pb-2 pt-3">
              <p className="small text-muted mb-2">
                {pendente ? (
                  <>
                    {resumoEntrada.atualizar > 0
                      ? `${resumoEntrada.atualizar} produto(s) já cadastrado(s) terão o estoque somado. `
                      : null}
                    {resumoEntrada.cadastrar > 0
                      ? `${resumoEntrada.cadastrar} produto(s) serão cadastrado(s). `
                      : null}
                    {resumoEntrada.ignorados > 0
                      ? `${resumoEntrada.ignorados} item(ns) com quantidade 0 serão ignorados. `
                      : null}
                    Total: {unidadesEntrada} unidade(s) para entrada. Você pode
                    alterar a quantidade de cada linha antes de confirmar.
                    Quantidade 0 não cadastra produto e não soma estoque.
                  </>
                ) : (
                  <>
                    {preview.resumo.atualizar > 0
                      ? `${preview.resumo.atualizar} produto(s) já cadastrado(s) terão o estoque somado. `
                      : null}
                    {preview.resumo.cadastrar > 0
                      ? `${preview.resumo.cadastrar} produto(s) serão cadastrado(s). `
                      : null}
                    Total: {preview.resumo.unidades} unidade(s).
                  </>
                )}
              </p>
            </div>
            <div className="card-body table-responsive p-0">
              <table className="table table-hover table-striped table-sm mb-0">
                <thead>
                  <tr>
                    <th style={{ width: "44px" }}>#</th>
                    <th>Produto</th>
                    <th>EAN</th>
                    <th className="text-right" style={{ width: "110px" }}>
                      Qtd. entrada
                    </th>
                    <th className="text-right">V. unit.</th>
                    <th className="text-right">Total</th>
                    <th>Situação no estoque</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.itens.map((item) => {
                    const estoqueAtual = item.produto_existente?.qtd_estoque ?? 0;
                    const cadastrar = item.acao_prevista === "cadastrar";
                    const qtdNota = Math.round(Number(item.q_com)) || 0;
                    const qtdLinha = qtdDe(item.id, item.q_com);
                    const estoqueApos =
                      preview.status === "pendente"
                        ? (estoqueAposPorItem.get(item.id) ?? estoqueAtual + qtdLinha)
                        : item.estoque_apos;
                    const ignorado =
                      pendente ? qtdLinha <= 0 : item.acao == null || (item.qtd_entrada ?? 0) <= 0;
                    return (
                      <tr key={item.id} className={ignorado ? "text-muted" : undefined}>
                        <td>{item.n_item}</td>
                        <td>
                          <div>{item.x_prod}</div>
                          <div className="text-muted small">
                            {item.c_prod ? `Cód. ${item.c_prod}` : ""}
                            {item.ncm ? ` · NCM ${item.ncm}` : ""}
                            {item.u_com ? ` · ${item.u_com}` : ""}
                            {item.cfop ? ` · CFOP ${item.cfop}` : ""}
                          </div>
                        </td>
                        <td className="small text-muted">{item.c_ean || "—"}</td>
                        <td className="text-right">
                          {pendente ? (
                            <>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                className="form-control form-control-sm text-right ml-auto"
                                style={{ maxWidth: "6.5rem" }}
                                aria-label={`Quantidade de ${item.x_prod}`}
                                disabled={dandoEntrada || excluindo}
                                value={qtdLinha}
                                onChange={(e) => {
                                  const n = Number.parseInt(e.target.value, 10);
                                  setQtdEditada((prev) => ({
                                    ...prev,
                                    [item.id]: Number.isFinite(n) && n >= 0 ? n : 0,
                                  }));
                                }}
                              />
                              {qtdLinha !== qtdNota ? (
                                <div className="small text-muted mt-1">Nota: {qtdLabel(qtdNota)}</div>
                              ) : null}
                            </>
                          ) : (
                            qtdLabel(item.qtd_entrada ?? item.q_com)
                          )}
                        </td>
                        <td className="text-right">{formatBRL(item.v_un_com)}</td>
                        <td className="text-right">{formatBRL(item.v_prod)}</td>
                        <td>
                          {preview.status === "entrada_realizada" ? (
                            ignorado ? (
                              <span className="badge badge-secondary">Não importado</span>
                            ) : (
                              <span className="badge badge-success">
                                {item.acao === "cadastrado" ? "Cadastrado" : "Atualizado"}{" "}
                                {item.saldo_anterior ?? 0} → {item.saldo_posterior ?? "—"}
                              </span>
                            )
                          ) : qtdLinha <= 0 ? (
                            <>
                              <span className="badge badge-secondary">Ignorado</span>
                              <div className="small text-muted mt-1">
                                Não entra no estoque
                              </div>
                            </>
                          ) : cadastrar ? (
                            <>
                              <span className="badge badge-info">Novo cadastro</span>
                              <div className="small text-muted mt-1">
                                Estoque 0 → {estoqueApos}
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="badge badge-primary">Já cadastrado</span>
                              <div className="small text-muted mt-1">
                                Estoque {estoqueAtual} → {estoqueApos}
                                {item.produto_existente?.sku
                                  ? ` · ${item.produto_existente.sku}`
                                  : ""}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      <div className="card card-outline card-secondary mt-3">
        <div className="card-header">
          <h3 className="card-title mb-0">
            Notas importadas — {nomeEmpresaSelecionada}
          </h3>
        </div>
        <div className="card-body table-responsive p-0">
          <table className="table table-hover table-sm mb-0">
            <thead>
              <tr>
                <th>NF-e</th>
                <th>Emissão</th>
                <th>Emitente</th>
                <th className="text-right">Valor</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {listaLoading ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    Carregando…
                  </td>
                </tr>
              ) : lista.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    Nenhuma NF-e importada ainda.
                  </td>
                </tr>
              ) : (
                lista.map((row) => (
                  <tr
                    key={row.id}
                    className={preview?.id === row.id ? "table-active" : undefined}
                  >
                    <td>
                      {row.numero_nf}
                      <span className="text-muted small"> / {row.serie}</span>
                    </td>
                    <td className="small">{formatDataHora(row.dh_emissao)}</td>
                    <td>
                      <div>{row.emit_nome || "—"}</div>
                      <div className="text-muted small">
                        {formatarCnpjCpf(row.emit_cnpj, "CNPJ")}
                      </div>
                    </td>
                    <td className="text-right">{formatBRL(Number(row.valor_nf))}</td>
                    <td>
                      {row.status === "entrada_realizada" ? (
                        <span className="badge badge-success">Entrada realizada</span>
                      ) : (
                        <span className="badge badge-warning">Pendente</span>
                      )}
                    </td>
                    <td className="text-right text-nowrap">
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm mr-1"
                        onClick={() => void abrirNota(row.id)}
                      >
                        Ver
                      </button>
                      {podeExcluir ? (
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          disabled={excluindo}
                          onClick={() =>
                            setConfirmExcluir({
                              id: row.id,
                              numero_nf: row.numero_nf,
                              status: row.status,
                            })
                          }
                        >
                          Excluir
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

      {confirmEntrada && preview ? (
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
                  <h5 className="modal-title">Confirmar entrada no estoque</h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={() => setConfirmEntrada(false)}
                    disabled={dandoEntrada}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
                <div className="modal-body">
                  <p>
                    Confirmar entrada da NF-e <strong>{preview.numero_nf}</strong> no
                    estoque de <strong>{nomeEmpresaSelecionada}</strong>? Itens com
                    quantidade 0 serão ignorados
                    {resumoEntrada.cadastrar > 0
                      ? " e os produtos novos (com quantidade maior que zero) serão cadastrados nessa empresa"
                      : ""}
                    .
                  </p>
                  <ul className="mb-0">
                    <li>
                      {resumoEntrada.atualizar} produto(s) atualizado(s)
                    </li>
                    <li>{resumoEntrada.cadastrar} produto(s) novo(s)</li>
                    <li>{unidadesEntrada} unidade(s) no total</li>
                    {resumoEntrada.ignorados > 0 ? (
                      <li>
                        {resumoEntrada.ignorados} item(ns) ignorado(s) (quantidade 0)
                      </li>
                    ) : null}
                  </ul>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setConfirmEntrada(false)}
                    disabled={dandoEntrada}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => void confirmarEntrada()}
                    disabled={dandoEntrada}
                  >
                    {dandoEntrada ? "Processando…" : "Confirmar entrada"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" role="presentation" />
        </>
      ) : null}

      {podeExcluir && confirmExcluir ? (
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
                  <h5 className="modal-title">Excluir importação</h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={() => setConfirmExcluir(null)}
                    disabled={excluindo}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
                <div className="modal-body">
                  {confirmExcluir.status === "entrada_realizada" ? (
                    <>
                      <p>
                        Excluir a NF-e <strong>{confirmExcluir.numero_nf}</strong> e{" "}
                        <strong>reverter a entrada</strong> no estoque de{" "}
                        <strong>{nomeEmpresaSelecionada}</strong>?
                      </p>
                      <p className="mb-0 small text-muted">
                        As quantidades somadas por esta nota serão retiradas do estoque
                        atual. Produtos que tenham sido cadastrados pela importação
                        permanecem no cadastro. Depois da exclusão, o XML poderá ser
                        importado de novo.
                      </p>
                    </>
                  ) : (
                    <p className="mb-0">
                      Excluir a NF-e <strong>{confirmExcluir.numero_nf}</strong>? Nenhuma
                      entrada foi feita; só o XML importado será removido.
                    </p>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setConfirmExcluir(null)}
                    disabled={excluindo}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void confirmarExclusao()}
                    disabled={excluindo}
                  >
                    {excluindo
                      ? "Excluindo…"
                      : confirmExcluir.status === "entrada_realizada"
                        ? "Excluir e reverter estoque"
                        : "Excluir"}
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
