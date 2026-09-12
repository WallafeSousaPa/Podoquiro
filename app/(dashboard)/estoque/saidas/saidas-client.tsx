"use client";

import { formatarCnpjCpf } from "@/lib/estoque/parse-nfe-xml";
import type { ParceiroEstoqueRow } from "@/lib/estoque/parceiro-campos";
import { gerarDanfeNfePdfUrl } from "@/lib/client/render-danfe-nfe-pdf";
import {
  gerarPreOrcamentoSaidaUrl,
  type PreOrcamentoSaida,
} from "@/lib/client/render-pre-orcamento-saida";
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
  v_custo: number;
  v_desc: number;
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
  id_nfe_emissao: string | null;
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
  v_custo?: number;
  v_desc?: number;
  v_total: number;
  saldo_anterior: number | null;
  saldo_posterior: number | null;
};

type SaidaDetalhe = SaidaListaRow & {
  emit_nome: string | null;
  emit_fantasia: string | null;
  emit_cnpj: string | null;
  emit_endereco: string | null;
  emit_numero: string | null;
  emit_complemento: string | null;
  emit_bairro: string | null;
  emit_municipio: string | null;
  emit_uf: string | null;
  emit_cep: string | null;
  dest_ie: string | null;
  dest_endereco: string | null;
  dest_numero: string | null;
  dest_complemento: string | null;
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

function precoVendaCadastro(p: ProdutoOpcao): number {
  if (p.preco_venda == null) return 0;
  const v = Number(p.preco_venda);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function saidaParaPreOrcamento(s: SaidaDetalhe): PreOrcamentoSaida {
  return {
    id: s.id,
    data_saida: s.data_saida,
    emit_nome: s.emit_nome,
    emit_fantasia: s.emit_fantasia,
    emit_cnpj: s.emit_cnpj,
    emit_endereco: s.emit_endereco,
    emit_numero: s.emit_numero,
    emit_complemento: s.emit_complemento,
    emit_bairro: s.emit_bairro,
    emit_municipio: s.emit_municipio,
    emit_uf: s.emit_uf,
    emit_cep: s.emit_cep,
    dest_nome: s.dest_nome,
    dest_doc: s.dest_doc,
    dest_tipo: s.dest_tipo,
    dest_ie: s.dest_ie,
    dest_endereco: s.dest_endereco,
    dest_numero: s.dest_numero,
    dest_complemento: s.dest_complemento,
    dest_bairro: s.dest_bairro,
    dest_municipio: s.dest_municipio,
    dest_uf: s.dest_uf,
    dest_cep: s.dest_cep,
    dest_email: s.dest_email,
    dest_fone: s.dest_fone,
    itens: s.itens.map((it) => ({
      produto: it.produto,
      sku: it.sku,
      un_medida: it.un_medida || "UN",
      qtd: Number(it.qtd) || 0,
      v_un: Number(it.v_un) || 0,
      v_desc: Number(it.v_desc ?? 0) || 0,
      v_total: Number(it.v_total) || 0,
    })),
  };
}

function totalLinhaSaida(l: Pick<LinhaSaida, "qtd" | "v_un" | "v_desc">): number {
  const bruto = roundMoney(l.qtd * l.v_un);
  const desc = Math.min(Math.max(0, roundMoney(l.v_desc)), bruto);
  return roundMoney(bruto - desc);
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
  const [avisoSemVenda, setAvisoSemVenda] = useState<string | null>(null);
  const [confirmSaida, setConfirmSaida] = useState(false);
  const [perguntarNota, setPerguntarNota] = useState<{
    id: string;
    destNome: string;
    destDoc: string;
    destTipo: "CPF" | "CNPJ";
  } | null>(null);
  const [detalhe, setDetalhe] = useState<SaidaDetalhe | null>(null);
  const [confirmCancelar, setConfirmCancelar] = useState<SaidaListaRow | null>(null);
  const [emitindoNota, setEmitindoNota] = useState(false);
  const [danfeUrl, setDanfeUrl] = useState<string | null>(null);
  const [danfeCarregando, setDanfeCarregando] = useState(false);
  const [danfeNfeId, setDanfeNfeId] = useState<string | null>(null);
  const [danfeSaidaId, setDanfeSaidaId] = useState<string | null>(null);
  const [orcamentoUrl, setOrcamentoUrl] = useState<string | null>(null);
  const [orcamentoCarregando, setOrcamentoCarregando] = useState(false);
  const [confirmCancelarNota, setConfirmCancelarNota] = useState<{
    idNfe: string;
    idSaida?: string;
  } | null>(null);
  const [justificativaCancel, setJustificativaCancel] = useState(
    "Cancelamento da nota fiscal por erro na emissão.",
  );
  const [cancelandoNota, setCancelandoNota] = useState(false);
  const [erroCancelNota, setErroCancelNota] = useState<string | null>(null);

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
    () => linhas.reduce((s, l) => s + totalLinhaSaida(l), 0),
    [linhas],
  );
  const custoTotal = useMemo(
    () => linhas.reduce((s, l) => s + roundMoney(l.qtd * l.v_custo), 0),
    [linhas],
  );

  const compradorSel = compradores.find((c) => c.id === idComprador) ?? null;
  const estoqueInsuficiente = linhas.some((l) => l.qtd > l.qtd_estoque);

  function adicionarProduto() {
    const p = produtos.find((x) => x.id === produtoAdd);
    if (!p) return;
    const venda = precoVendaCadastro(p);
    if (venda <= 0) {
      setAvisoSemVenda(p.produto);
      return;
    }
    setError(null);
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
        v_un: venda,
        v_custo: Number.isFinite(Number(p.preco)) && Number(p.preco) >= 0 ? Number(p.preco) : 0,
        v_desc: 0,
      },
    ]);
    setProdutoAdd("");
  }

  function atualizarLinha(key: string, patch: Partial<LinhaSaida>) {
    setLinhas((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        const bruto = roundMoney(next.qtd * next.v_un);
        if (next.v_desc > bruto) next.v_desc = bruto;
        return next;
      }),
    );
  }

  function podeConfirmar(): string | null {
    if (linhas.length === 0) return "Inclua ao menos um produto.";
    if (linhas.some((l) => l.qtd <= 0)) return "Quantidade deve ser maior que zero.";
    if (linhas.some((l) => l.v_desc < 0)) return "Desconto não pode ser negativo.";
    if (linhas.some((l) => roundMoney(l.v_desc) > roundMoney(l.qtd * l.v_un))) {
      return "O desconto não pode ser maior que o total do produto.";
    }
    if (linhas.some((l) => l.v_un <= 0)) {
      return "Há produto sem valor de venda. Cadastre em Estoque → Cadastro.";
    }
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
            v_desc: roundMoney(l.v_desc),
          })),
        }),
      });
      const j = (await res.json()) as {
        data?: {
          id: string;
          dest_nome?: string | null;
          dest_doc?: string | null;
          dest_tipo?: "CPF" | "CNPJ" | null;
        };
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível registrar a saída.");
      setConfirmSaida(false);
      setLinhas([]);
      setObservacao("");
      await Promise.all([carregarLista(), carregarProdutos()]);
      if (tipo === "venda" && j.data?.id) {
        setPerguntarNota({
          id: j.data.id,
          destNome: j.data.dest_nome || compradorSel?.nome || "comprador",
          destDoc: j.data.dest_doc ?? "",
          destTipo: j.data.dest_tipo === "CNPJ" ? "CNPJ" : "CPF",
        });
        setSucesso("Saída registrada. Informe se deseja emitir a nota fiscal.");
      } else {
        setSucesso("Saída registrada e estoque baixado.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar a saída.");
    } finally {
      setEnviando(false);
    }
  }

  async function emitirNotaSaida(idSaida: string) {
    setEmitindoNota(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/estoque/saidas/${encodeURIComponent(idSaida)}/emitir-nfe`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const j = (await res.json()) as {
        error?: string;
        xMotivo?: string;
        nNF?: number;
        serie?: number;
        dest_tipo?: "CPF" | "CNPJ";
        id_nfe_emissao?: string;
      };
      if (!res.ok) throw new Error(j.error ?? j.xMotivo ?? "Não foi possível emitir a nota.");
      setPerguntarNota(null);
      setSucesso(
        j.nNF
          ? `Nota fiscal ${j.dest_tipo ?? ""} nº ${j.nNF} (série ${j.serie}) autorizada.`
          : "Nota fiscal emitida.",
      );
      await carregarLista();
      if (detalhe?.id === idSaida) await abrirDetalhe(idSaida);
      if (j.id_nfe_emissao) await abrirDanfe(j.id_nfe_emissao, idSaida);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível emitir a nota.");
    } finally {
      setEmitindoNota(false);
    }
  }

  function fecharDanfe() {
    if (danfeUrl) URL.revokeObjectURL(danfeUrl);
    setDanfeUrl(null);
    setDanfeNfeId(null);
    setDanfeSaidaId(null);
  }

  async function abrirDanfe(idNfe: string, idSaida?: string) {
    setDanfeCarregando(true);
    setError(null);
    try {
      const res = await fetch(`/api/nfe/danfe-dados?id=${encodeURIComponent(idNfe)}`, {
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Falha ao carregar o DANFE.");
      const url = await gerarDanfeNfePdfUrl(j);
      if (danfeUrl) URL.revokeObjectURL(danfeUrl);
      setDanfeUrl(url);
      setDanfeNfeId(idNfe);
      setDanfeSaidaId(idSaida ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar o PDF da nota.");
    } finally {
      setDanfeCarregando(false);
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

  function fecharOrcamento() {
    if (orcamentoUrl) URL.revokeObjectURL(orcamentoUrl);
    setOrcamentoUrl(null);
  }

  async function abrirPreOrcamento(idSaida: string) {
    setOrcamentoCarregando(true);
    setError(null);
    try {
      const res = await fetch(`/api/estoque/saidas/${encodeURIComponent(idSaida)}`, {
        credentials: "include",
      });
      const j = (await res.json()) as { data?: SaidaDetalhe; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível gerar a proposta.");
      if (!j.data) throw new Error("Saída não encontrada.");
      const url = gerarPreOrcamentoSaidaUrl(saidaParaPreOrcamento(j.data));
      if (orcamentoUrl) URL.revokeObjectURL(orcamentoUrl);
      setOrcamentoUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar a proposta.");
    } finally {
      setOrcamentoCarregando(false);
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

  function abrirCancelarNota(idNfe: string, idSaida?: string) {
    setJustificativaCancel("Cancelamento da nota fiscal por erro na emissão.");
    setErroCancelNota(null);
    setConfirmCancelarNota({ idNfe, idSaida });
  }

  async function cancelarNota() {
    if (!confirmCancelarNota) return;
    const just = justificativaCancel.replace(/\s+/g, " ").trim();
    if (just.length < 15) {
      setErroCancelNota("A justificativa do cancelamento deve ter no mínimo 15 caracteres.");
      return;
    }
    setCancelandoNota(true);
    setErroCancelNota(null);
    const { idNfe, idSaida } = confirmCancelarNota;
    try {
      const res = await fetch("/api/nfe/cancelar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: idNfe,
          justificativa: just,
        }),
      });
      const j = (await res.json()) as { error?: string; xMotivo?: string };
      if (!res.ok) throw new Error(j.error ?? j.xMotivo ?? "Não foi possível cancelar a nota.");
      setConfirmCancelarNota(null);
      fecharDanfe();
      setSucesso("Nota fiscal cancelada na SEFAZ. Você pode emitir uma nova, se precisar.");
      await carregarLista();
      if (idSaida) {
        await abrirDetalhe(idSaida);
      } else if (detalhe?.id_nfe_emissao === idNfe) {
        await abrirDetalhe(detalhe.id);
      }
    } catch (e) {
      setErroCancelNota(e instanceof Error ? e.message : "Não foi possível cancelar a nota.");
    } finally {
      setCancelandoNota(false);
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
        <ParceirosEstoqueTab
          papel="fornecedor"
          empresaId={empresaId}
          empresaNome={nomeEmpresaSelecionada}
          disabled={enviando}
        />
      ) : null}
      {aba === "compradores" ? (
        <ParceirosEstoqueTab
          papel="comprador"
          empresaId={empresaId}
          empresaNome={nomeEmpresaSelecionada}
          disabled={enviando}
        />
      ) : null}

      {avisoSemVenda ? (
        <>
          <div
            className="modal fade show"
            style={{ display: "block" }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Valor de venda não cadastrado</h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={() => setAvisoSemVenda(null)}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
                <div className="modal-body">
                  <p className="mb-2">
                    <strong>{avisoSemVenda}</strong> não tem valor de venda cadastrado.
                  </p>
                  <p className="mb-0">
                    Cadastre o valor em <strong>Estoque → Cadastro</strong> (em reais ou
                    percentual sobre o custo) e depois volte para incluir o produto na
                    saída.
                  </p>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setAvisoSemVenda(null)}
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

      {aba === "saidas" ? (
        <>
          <div className="card card-outline card-primary mb-3">
            <div className="card-header">
              <h3 className="card-title mb-0">Nova saída</h3>
            </div>
            <div className="card-body">
              <p className="text-muted small mb-3">
                Baixa produtos do estoque de <strong>{nomeEmpresaSelecionada}</strong>.
                Tipos: venda, transferência, perda e avulso. Na venda, após confirmar a
                baixa, o sistema pergunta se deseja emitir a NF-e para o CPF ou CNPJ do
                comprador.
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
                    {produtosDisponiveis.map((p) => {
                      const venda = precoVendaCadastro(p);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.produto} · estoque {p.qtd_estoque}
                          {p.sku ? ` · ${p.sku}` : ""} · custo{" "}
                          {formatBRL(Number(p.preco) || 0)} · venda{" "}
                          {venda > 0 ? formatBRL(venda) : "não cadastrada"}
                        </option>
                      );
                    })}
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
                      <th className="text-right" style={{ width: "8rem" }}>
                        Custo
                      </th>
                      <th className="text-right" style={{ width: "9rem" }}>
                        Venda
                      </th>
                      <th className="text-right" style={{ width: "8rem" }}>
                        Desc. (R$)
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
                        <td colSpan={8} className="text-muted text-center py-3">
                          Nenhum produto na saída.
                        </td>
                      </tr>
                    ) : (
                      linhas.map((l) => {
                        const apos = l.qtd_estoque - l.qtd;
                        return (
                          <tr
                            key={l.key}
                            className={
                              l.qtd > l.qtd_estoque || (tipo === "venda" && l.v_un <= 0)
                                ? "table-warning"
                                : undefined
                            }
                          >
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
                            <td className="text-right">{formatBRL(l.v_custo)}</td>
                            <td className="text-right">{formatBRL(l.v_un)}</td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                className="form-control form-control-sm text-right"
                                value={l.v_desc}
                                disabled={enviando}
                                aria-label={`Desconto de ${l.produto}`}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  atualizarLinha(l.key, {
                                    v_desc: Number.isFinite(n) && n >= 0 ? n : 0,
                                  });
                                }}
                              />
                            </td>
                            <td className="text-right">{formatBRL(totalLinhaSaida(l))}</td>
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
                        <td colSpan={3} className="text-right">
                          <strong>Totais</strong>
                        </td>
                        <td className="text-right">
                          <strong>{formatBRL(custoTotal)}</strong>
                        </td>
                        <td colSpan={2} />
                        <td className="text-right">
                          <strong>{formatBRL(valorTotal)}</strong>
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
              <p className="small text-muted mb-2">
                Custo e venda vêm do cadastro do produto. A venda não pode ser alterada
                nesta tela. O desconto, se houver, reduz o total da nota.
              </p>

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
                          {row.tipo === "venda" && row.status === "confirmada" ? (
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm ml-1"
                              disabled={orcamentoCarregando}
                              onClick={() => void abrirPreOrcamento(row.id)}
                            >
                              {orcamentoCarregando ? "…" : "Proposta"}
                            </button>
                          ) : null}
                          {row.tipo === "venda" &&
                          row.nota_venda_status === "gerada" &&
                          row.id_nfe_emissao ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm ml-1"
                                disabled={danfeCarregando}
                                onClick={() => void abrirDanfe(row.id_nfe_emissao!, row.id)}
                              >
                                {danfeCarregando ? "PDF…" : "DANFE"}
                              </button>
                              {podeCancelar ? (
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm ml-1"
                                  disabled={cancelandoNota}
                                  onClick={() => abrirCancelarNota(row.id_nfe_emissao!, row.id)}
                                >
                                  Cancelar nota
                                </button>
                              ) : null}
                            </>
                          ) : null}
                          {podeCancelar &&
                          row.status === "confirmada" &&
                          row.nota_venda_status !== "gerada" ? (
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
                    <strong>{nomeEmpresaSelecionada}</strong>?{" "}
                    {tipo === "venda" ? "Total da venda " : "Total "}
                    <strong>{formatBRL(valorTotal)}</strong>
                    {tipo === "venda" ? " (valor da nota fiscal)." : "."}
                  </p>
                  {tipo === "venda" ? (
                    <p className="mb-0 text-muted small">
                      Depois de confirmar, você poderá emitir a nota fiscal para o CPF ou
                      CNPJ do comprador.
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

      {perguntarNota ? (
        <>
          <div
            className="modal fade show"
            style={{ display: "block" }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-dialog modal-dialog-scrollable" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Emitir nota fiscal?</h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={() => setPerguntarNota(null)}
                    disabled={emitindoNota}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
                <div className="modal-body">
                  <p>
                    A saída de venda foi registrada. Você pode enviar a proposta
                    ao comprador para conferência e, depois, emitir a NF-e.
                  </p>
                  <p className="mb-1">
                    <strong>{perguntarNota.destNome}</strong>
                  </p>
                  <p className="mb-0">
                    {perguntarNota.destTipo}:{" "}
                    <strong>
                      {formatarCnpjCpf(perguntarNota.destDoc, perguntarNota.destTipo)}
                    </strong>
                  </p>
                  {error ? (
                    <div className="alert alert-danger py-2 small mt-3 mb-0" role="alert">
                      {error}
                    </div>
                  ) : null}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={() => void abrirPreOrcamento(perguntarNota.id)}
                    disabled={emitindoNota || orcamentoCarregando}
                  >
                    {orcamentoCarregando ? "Gerando…" : "Proposta"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setPerguntarNota(null)}
                    disabled={emitindoNota}
                  >
                    Agora não
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => void emitirNotaSaida(perguntarNota.id)}
                    disabled={emitindoNota}
                  >
                    {emitindoNota ? "Emitindo…" : "Emitir nota"}
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
            style={{ display: "block", overflowY: "auto" }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="modal-dialog modal-lg modal-dialog-scrollable"
              role="document"
            >
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
                  {error && detalhe ? (
                    <div className="alert alert-danger py-2 small" role="alert">
                      {error}
                    </div>
                  ) : null}
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
                      {detalhe.dest_tipo ? ` · ${detalhe.dest_tipo}` : ""}
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
                        <th className="text-right">Custo</th>
                        <th className="text-right">Venda</th>
                        <th className="text-right">Desc.</th>
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
                          <td className="text-right">
                            {Number(it.v_custo ?? 0) > 0
                              ? formatBRL(Number(it.v_custo))
                              : "—"}
                          </td>
                          <td className="text-right">{formatBRL(Number(it.v_un))}</td>
                          <td className="text-right">
                            {Number(it.v_desc ?? 0) > 0
                              ? formatBRL(Number(it.v_desc))
                              : "—"}
                          </td>
                          <td className="text-right">{formatBRL(Number(it.v_total))}</td>
                          <td className="text-right small">
                            {it.saldo_anterior ?? "—"} → {it.saldo_posterior ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="text-right">
                          <strong>Totais</strong>
                        </td>
                        <td className="text-right">
                          <strong>
                            {formatBRL(
                              detalhe.itens.reduce(
                                (s, it) =>
                                  s +
                                  roundMoney(Number(it.qtd) * Number(it.v_custo ?? 0)),
                                0,
                              ),
                            )}
                          </strong>
                        </td>
                        <td colSpan={2} />
                        <td className="text-right">
                          <strong>{formatBRL(Number(detalhe.valor_total))}</strong>
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="modal-footer">
                  {podeCancelar &&
                  detalhe.status === "confirmada" &&
                  detalhe.nota_venda_status !== "gerada" ? (
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
                  {detalhe.tipo === "venda" && detalhe.status === "confirmada" ? (
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      disabled={orcamentoCarregando}
                      onClick={() => void abrirPreOrcamento(detalhe.id)}
                    >
                      {orcamentoCarregando ? "Gerando…" : "Proposta"}
                    </button>
                  ) : null}
                  {detalhe.tipo === "venda" &&
                  detalhe.status === "confirmada" &&
                  detalhe.nota_venda_status === "pronta" ? (
                    <button
                      type="button"
                      className="btn btn-success"
                      disabled={emitindoNota}
                      onClick={() => void emitirNotaSaida(detalhe.id)}
                    >
                      {emitindoNota ? "Emitindo…" : "Emitir nota fiscal"}
                    </button>
                  ) : null}
                  {detalhe.tipo === "venda" &&
                  detalhe.nota_venda_status === "gerada" &&
                  detalhe.id_nfe_emissao ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={danfeCarregando}
                        onClick={() => void abrirDanfe(detalhe.id_nfe_emissao!, detalhe.id)}
                      >
                        {danfeCarregando ? "Gerando PDF…" : "Ver DANFE"}
                      </button>
                      {podeCancelar ? (
                        <button
                          type="button"
                          className="btn btn-outline-danger"
                          disabled={cancelandoNota}
                          onClick={() => abrirCancelarNota(detalhe.id_nfe_emissao!, detalhe.id)}
                        >
                          Cancelar nota
                        </button>
                      ) : null}
                    </>
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

      {confirmCancelarNota ? (
        <>
          <div
            className="modal fade show"
            style={{ display: "block", zIndex: 1070 }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-dialog" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Cancelar nota fiscal</h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={() => setConfirmCancelarNota(null)}
                    disabled={cancelandoNota}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
                <div className="modal-body">
                  {erroCancelNota ? (
                    <div className="alert alert-danger py-2 small" role="alert">
                      {erroCancelNota}
                    </div>
                  ) : null}
                  <p>
                    O cancelamento é enviado à SEFAZ e <strong>não pode ser desfeito</strong>.
                    A SEFAZ costuma aceitar apenas dentro do prazo legal (em geral 24 horas após
                    a autorização).
                  </p>
                  <div className="form-group mb-0">
                    <label htmlFor="nfe-justificativa-cancel">Justificativa</label>
                    <textarea
                      id="nfe-justificativa-cancel"
                      className="form-control"
                      rows={3}
                      maxLength={255}
                      value={justificativaCancel}
                      disabled={cancelandoNota}
                      onChange={(e) => setJustificativaCancel(e.target.value)}
                    />
                    <small className="form-text text-muted">
                      Mínimo 15 caracteres. {justificativaCancel.trim().length}/255
                    </small>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setConfirmCancelarNota(null)}
                    disabled={cancelandoNota}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void cancelarNota()}
                    disabled={cancelandoNota || justificativaCancel.trim().length < 15}
                  >
                    {cancelandoNota ? "Cancelando…" : "Confirmar cancelamento"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div
            className="modal-backdrop fade show"
            role="presentation"
            style={{ zIndex: 1065 }}
          />
        </>
      ) : null}

      {danfeUrl ? (
        <>
          <div
            className="modal fade show"
            style={{ display: "block", zIndex: 1060 }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-dialog modal-xl" role="document" style={{ maxWidth: "900px" }}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">DANFE — NF-e</h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={fecharDanfe}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
                <div className="modal-body p-0" style={{ height: "75vh" }}>
                  <iframe
                    title="DANFE da nota fiscal"
                    src={danfeUrl}
                    style={{ width: "100%", height: "100%", border: 0 }}
                  />
                </div>
                <div className="modal-footer">
                  <a
                    className="btn btn-outline-primary"
                    href={danfeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir em nova aba
                  </a>
                  {podeCancelar && danfeNfeId ? (
                    <button
                      type="button"
                      className="btn btn-outline-danger"
                      disabled={cancelandoNota}
                      onClick={() => abrirCancelarNota(danfeNfeId, danfeSaidaId ?? undefined)}
                    >
                      Cancelar nota
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-secondary" onClick={fecharDanfe}>
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div
            className="modal-backdrop fade show"
            role="presentation"
            style={{ zIndex: 1055 }}
          />
        </>
      ) : null}

      {orcamentoUrl ? (
        <>
          <div
            className="modal fade show"
            style={{ display: "block", zIndex: 1070 }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-dialog modal-xl" role="document" style={{ maxWidth: "900px" }}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Proposta</h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={fecharOrcamento}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
                <div className="modal-body p-0" style={{ height: "75vh" }}>
                  <iframe
                    id="pre-orcamento-frame"
                    title="Proposta da saída"
                    src={orcamentoUrl}
                    style={{ width: "100%", height: "100%", border: 0 }}
                  />
                </div>
                <div className="modal-footer">
                  <a
                    className="btn btn-outline-primary"
                    href={orcamentoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir em nova aba
                  </a>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      const f = document.getElementById(
                        "pre-orcamento-frame",
                      ) as HTMLIFrameElement | null;
                      f?.contentWindow?.print();
                    }}
                  >
                    Imprimir / PDF
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={fecharOrcamento}>
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div
            className="modal-backdrop fade show"
            role="presentation"
            style={{ zIndex: 1065 }}
          />
        </>
      ) : null}
    </>
  );
}
