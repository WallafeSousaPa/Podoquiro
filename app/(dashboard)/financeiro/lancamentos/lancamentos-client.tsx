"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CATEGORIAS_ENTRADA,
  CATEGORIAS_SAIDA_FIXA,
  CATEGORIAS_SAIDA_VARIAVEL,
  categoriasDaNatureza,
  rotuloCompetencia,
  type NaturezaLancamento,
  type TipoLancamento,
} from "@/lib/financeiro/lancamentos";
import { mascararMoedaBr } from "@/lib/financeiro/moeda-br-input";

export type EmpresaOpcao = { id: number; nome: string };

export type LancamentoItem = {
  id: number;
  id_empresa: number | null;
  unidade: string;
  tipo: TipoLancamento;
  natureza: NaturezaLancamento;
  categoria: string;
  motivo: string;
  valor: number;
  data: string;
  meio: string;
  meio2: string | null;
  valor1: number | null;
  valor2: number | null;
  status: "pago" | "pendente";
  observacao: string;
  origem: string;
};

const CHIPS = [
  { motivo: "Aluguel", categoria: "Fixas de Funcionamento", natureza: "fixa" as const },
  { motivo: "Energia", categoria: "Fixas de Funcionamento", natureza: "fixa" as const },
  { motivo: "Contadora", categoria: "Serviços Fixos", natureza: "fixa" as const },
  { motivo: "Salários", categoria: "Pessoal Fixo", natureza: "fixa" as const },
  { motivo: "Insumos", categoria: "Variável de Insumos", natureza: "variavel" as const },
];

function hojeIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function competenciaAtual(): string {
  return hojeIso().slice(0, 7);
}

function competenciasRecentes(): string[] {
  const [ano, mes] = competenciaAtual().split("-").map(Number);
  const lista: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const data = new Date(ano, mes - 1 - i, 1);
    const y = data.getFullYear();
    const m = String(data.getMonth() + 1).padStart(2, "0");
    lista.push(`${y}-${m}`);
  }
  return lista;
}

function fmtMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function meioExibido(item: LancamentoItem): string {
  if (item.meio2 && item.valor1 != null && item.valor2 != null) {
    return `${item.meio} ${fmtMoeda(item.valor1)} / ${item.meio2} ${fmtMoeda(item.valor2)}`;
  }
  return item.meio2 ? `${item.meio} / ${item.meio2}` : item.meio;
}

export function LancamentosClient({
  empresas,
  meios,
  empresaAtualId,
}: {
  empresas: EmpresaOpcao[];
  meios: string[];
  empresaAtualId: number;
}) {
  const unidadeInicial = empresas.some((e) => e.id === empresaAtualId)
    ? String(empresaAtualId)
    : String(empresas[0]?.id ?? "");

  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [lista, setLista] = useState<LancamentoItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState("TODOS");
  const [filtroUnidade, setFiltroUnidade] = useState("TODAS");
  const [busca, setBusca] = useState("");

  const [tipo, setTipo] = useState<TipoLancamento>("saida");
  const [natureza, setNatureza] = useState<NaturezaLancamento>("fixa");
  const [unidade, setUnidade] = useState(unidadeInicial);
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_SAIDA_FIXA[0]);
  const [motivo, setMotivo] = useState("");
  const [valorTexto, setValorTexto] = useState("");
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hojeIso);
  const [meio, setMeio] = useState(meios[0] ?? "");
  const [dividir, setDividir] = useState(false);
  const [meio2, setMeio2] = useState(meios[1] ?? meios[0] ?? "");
  const [valor1Texto, setValor1Texto] = useState("");
  const [valor1, setValor1] = useState<number | null>(null);
  const [valor2Texto, setValor2Texto] = useState("");
  const [valor2, setValor2] = useState<number | null>(null);
  const [status, setStatus] = useState<"pago" | "pendente">("pago");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [detalhe, setDetalhe] = useState<LancamentoItem | null>(null);

  const categorias = categoriasDaNatureza(tipo === "entrada" ? "entrada" : natureza);

  const carregar = useCallback(async (mes: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/financeiro/lancamentos?competencia=${mes}`);
      const json = (await res.json()) as { lancamentos?: LancamentoItem[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Não foi possível carregar os lançamentos.");
      setLista(json.lancamentos ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os lançamentos.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar(competencia);
  }, [competencia, carregar]);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 4000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    if (!categorias.includes(categoria)) setCategoria(categorias[0] ?? "");
  }, [categorias, categoria]);

  const daUnidade = useMemo(() => {
    if (filtroUnidade === "TODAS") return lista;
    if (filtroUnidade === "GERAL") return lista.filter((item) => item.id_empresa == null);
    const id = Number(filtroUnidade);
    return lista.filter((item) => item.id_empresa === id);
  }, [lista, filtroUnidade]);

  const kpis = useMemo(() => {
    let entradas = 0;
    let fixas = 0;
    let variaveis = 0;
    for (const item of daUnidade) {
      if (item.status !== "pago") continue;
      if (item.tipo === "entrada") entradas += item.valor;
      else if (item.natureza === "fixa") fixas += item.valor;
      else variaveis += item.valor;
    }
    return {
      entradas,
      fixas,
      variaveis,
      saldo: Math.round((entradas - fixas - variaveis) * 100) / 100,
    };
  }, [daUnidade]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return daUnidade.filter((item) => {
      const tipoOk =
        filtroTipo === "TODOS" ||
        (filtroTipo === "ENTRADA" && item.tipo === "entrada") ||
        item.natureza === filtroTipo.toLowerCase();
      const texto = `${item.motivo} ${item.categoria} ${item.meio} ${item.meio2 ?? ""}`.toLowerCase();
      return tipoOk && (!q || texto.includes(q));
    });
  }, [daUnidade, filtroTipo, busca]);

  function escolherTipo(novo: TipoLancamento) {
    setTipo(novo);
    if (novo === "entrada") setCategoria(CATEGORIAS_ENTRADA[0]);
    else setCategoria(natureza === "variavel" ? CATEGORIAS_SAIDA_VARIAVEL[0] : CATEGORIAS_SAIDA_FIXA[0]);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (valor == null || valor <= 0) {
      setErro("Informe o valor.");
      return;
    }
    if (!motivo.trim()) {
      setErro("Informe o motivo.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/financeiro/lancamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_empresa: Number(unidade),
          tipo,
          natureza: tipo === "entrada" ? "entrada" : natureza,
          categoria,
          motivo,
          valor,
          data,
          meio,
          dividir,
          meio2: dividir ? meio2 : null,
          valor1: dividir ? valor1 : null,
          valor2: dividir ? valor2 : null,
          status,
          observacao,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Não foi possível salvar.");
      setMotivo("");
      setValorTexto("");
      setValor(null);
      setValor1Texto("");
      setValor1(null);
      setValor2Texto("");
      setValor2(null);
      setObservacao("");
      setDividir(false);
      setAviso("Lançamento salvo.");
      if (data.slice(0, 7) === competencia) await carregar(competencia);
      else setCompetencia(data.slice(0, 7));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(item: LancamentoItem) {
    if (item.origem === "caixa") return;
    if (!window.confirm(`Excluir "${item.motivo}"?`)) return;
    setErro(null);
    try {
      const res = await fetch(`/api/financeiro/lancamentos/${item.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Não foi possível excluir.");
      setLista((prev) => prev.filter((row) => row.id !== item.id));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  return (
    <div className="lancamentos">
      <div className="lanc-toolbar">
        <div>
          <div className="text-muted small">Competência</div>
          <select
            className="form-control"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            aria-label="Competência"
          >
            {competenciasRecentes().map((mes) => (
              <option key={mes} value={mes}>
                {rotuloCompetencia(mes)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {erro ? <div className="alert alert-danger">{erro}</div> : null}

      <div className="lanc-kpis">
        <article className="lanc-kpi">
          <div className="lanc-kpi-top">
            <div>
              <span>Entradas</span>
              <strong>{fmtMoeda(kpis.entradas)}</strong>
            </div>
            <i className="fas fa-arrow-down" aria-hidden />
          </div>
        </article>
        <article className="lanc-kpi coral">
          <div className="lanc-kpi-top">
            <div>
              <span>Saídas fixas</span>
              <strong>{fmtMoeda(kpis.fixas)}</strong>
            </div>
            <i className="fas fa-thumbtack" aria-hidden />
          </div>
        </article>
        <article className="lanc-kpi coral">
          <div className="lanc-kpi-top">
            <div>
              <span>Saídas variáveis</span>
              <strong>{fmtMoeda(kpis.variaveis)}</strong>
            </div>
            <i className="fas fa-chart-line" aria-hidden />
          </div>
        </article>
        <article className="lanc-kpi">
          <div className="lanc-kpi-top">
            <div>
              <span>Saldo</span>
              <strong style={{ color: kpis.saldo >= 0 ? "#1e7e34" : "#de765b" }}>
                {fmtMoeda(kpis.saldo)}
              </strong>
            </div>
            <i className="fas fa-balance-scale" aria-hidden />
          </div>
        </article>
      </div>

      <div className="lanc-grid">
        <section className="lanc-card">
          <header className="lanc-card-head">
            <h2>
              <i className="fas fa-plus-circle" aria-hidden />
              Novo lançamento
            </h2>
            <span className="lanc-modo">{tipo === "entrada" ? "Entrada" : "Saída"}</span>
          </header>
          <form className="lanc-body" onSubmit={(e) => void salvar(e)}>
            <div className="lanc-tipo" role="group" aria-label="Tipo de movimentação">
              <button
                type="button"
                className={tipo === "saida" ? "is-saida" : ""}
                onClick={() => escolherTipo("saida")}
              >
                <i className="fas fa-arrow-up mr-1" aria-hidden />
                Saída (Despesa)
              </button>
              <button
                type="button"
                className={tipo === "entrada" ? "is-entrada" : ""}
                onClick={() => escolherTipo("entrada")}
              >
                <i className="fas fa-arrow-down mr-1" aria-hidden />
                Entrada (Receita)
              </button>
            </div>

            {tipo === "entrada" ? (
              <p className="small text-muted">
                O que já foi recebido no caixa entra aqui sozinho, no dia da baixa do pagamento.
              </p>
            ) : null}

            <div className="form-row">
              {tipo === "saida" ? (
                <div className="form-group col-sm-6">
                  <label className="form-label" htmlFor="lanc-natureza">
                    Classificação
                  </label>
                  <select
                    id="lanc-natureza"
                    className="form-control"
                    value={natureza}
                    onChange={(e) => setNatureza(e.target.value as NaturezaLancamento)}
                  >
                    <option value="fixa">Despesa fixa</option>
                    <option value="variavel">Despesa variável</option>
                  </select>
                </div>
              ) : null}
              <div className={`form-group ${tipo === "saida" ? "col-sm-6" : "col-12"}`}>
                <label className="form-label" htmlFor="lanc-unidade">
                  Unidade
                </label>
                <select
                  id="lanc-unidade"
                  className="form-control"
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                >
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="lanc-categoria">
                Categoria
              </label>
              <select
                id="lanc-categoria"
                className="form-control"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              >
                {categorias.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="lanc-motivo">
                Motivo
              </label>
              <input
                id="lanc-motivo"
                className="form-control"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: Aluguel, energia, salário, repasse..."
                required
              />
              {tipo === "saida" ? (
                <div className="lanc-chips">
                  {CHIPS.map((chip) => (
                    <button
                      key={chip.motivo}
                      type="button"
                      className="lanc-chip"
                      onClick={() => {
                        setTipo("saida");
                        setNatureza(chip.natureza);
                        setCategoria(chip.categoria);
                        setMotivo(chip.motivo);
                      }}
                    >
                      {chip.motivo}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="form-row">
              <div className="form-group col-sm-6">
                <label className="form-label" htmlFor="lanc-valor">
                  Valor
                </label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-text lanc-prefixo">R$</span>
                  </div>
                  <input
                    id="lanc-valor"
                    className="form-control font-weight-bold"
                    inputMode="numeric"
                    value={valorTexto}
                    placeholder="0,00"
                    onChange={(e) => {
                      const mascarado = mascararMoedaBr(e.target.value);
                      setValorTexto(mascarado.texto);
                      setValor(mascarado.valor);
                    }}
                    required
                  />
                </div>
              </div>
              <div className="form-group col-sm-6">
                <label className="form-label" htmlFor="lanc-data">
                  Data
                </label>
                <input
                  id="lanc-data"
                  type="date"
                  className="form-control"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="form-label mb-0" htmlFor="lanc-meio">
                  Meio de pagamento
                </label>
                <div className="custom-control custom-switch">
                  <input
                    type="checkbox"
                    className="custom-control-input"
                    id="lanc-dividir"
                    checked={dividir}
                    onChange={(e) => setDividir(e.target.checked)}
                  />
                  <label className="custom-control-label small text-muted" htmlFor="lanc-dividir">
                    Dividir em 2 contas
                  </label>
                </div>
              </div>
              <div className="form-row">
                <div className={dividir ? "col-6" : "col-12"}>
                  <select
                    id="lanc-meio"
                    className="form-control"
                    value={meio}
                    onChange={(e) => setMeio(e.target.value)}
                  >
                    {meios.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                </div>
                {dividir ? (
                  <>
                    <div className="col-6">
                      <input
                        className="form-control"
                        inputMode="numeric"
                        placeholder="Valor conta 1"
                        value={valor1Texto}
                        onChange={(e) => {
                          const mascarado = mascararMoedaBr(e.target.value);
                          setValor1Texto(mascarado.texto);
                          setValor1(mascarado.valor);
                        }}
                      />
                    </div>
                    <div className="col-6 mt-2">
                      <select
                        className="form-control"
                        value={meio2}
                        onChange={(e) => setMeio2(e.target.value)}
                        aria-label="Segunda conta"
                      >
                        {meios.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-6 mt-2">
                      <input
                        className="form-control"
                        inputMode="numeric"
                        placeholder="Valor conta 2"
                        value={valor2Texto}
                        onChange={(e) => {
                          const mascarado = mascararMoedaBr(e.target.value);
                          setValor2Texto(mascarado.texto);
                          setValor2(mascarado.valor);
                        }}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-sm-5">
                <label className="form-label" htmlFor="lanc-status">
                  Status
                </label>
                <select
                  id="lanc-status"
                  className="form-control"
                  value={status}
                  onChange={(e) => setStatus(e.target.value === "pendente" ? "pendente" : "pago")}
                >
                  <option value="pago">Pago / efetivado</option>
                  <option value="pendente">Pendente / agendado</option>
                </select>
              </div>
              <div className="form-group col-sm-7">
                <label className="form-label" htmlFor="lanc-obs">
                  Observação
                </label>
                <input
                  id="lanc-obs"
                  className="form-control"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex.: parcela 4/48"
                />
              </div>
            </div>

            <button type="submit" className={`lanc-salvar ${tipo}`} disabled={salvando || meios.length === 0}>
              <i className="fas fa-check-circle mr-1" aria-hidden />
              {salvando ? "Salvando..." : "Salvar lançamento"}
            </button>
          </form>
        </section>

        <section className="lanc-card">
          <div className="lanc-body">
            <div className="lanc-lista-head">
              <h2>Lançamentos</h2>
              <div className="lanc-filtros">
                <select
                  className="form-control form-control-sm"
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                  aria-label="Filtrar tipo"
                >
                  <option value="TODOS">Todos os tipos</option>
                  <option value="FIXA">Saída fixa</option>
                  <option value="VARIAVEL">Saída variável</option>
                  <option value="ENTRADA">Entradas</option>
                </select>
                <select
                  className="form-control form-control-sm"
                  value={filtroUnidade}
                  onChange={(e) => setFiltroUnidade(e.target.value)}
                  aria-label="Filtrar unidade"
                >
                  <option value="TODAS">Todas as unidades</option>
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="input-group input-group-sm mb-3">
              <div className="input-group-prepend">
                <span className="input-group-text bg-white">
                  <i className="fas fa-search text-muted" aria-hidden />
                </span>
              </div>
              <input
                className="form-control"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por motivo, categoria ou meio..."
              />
            </div>

            {carregando ? <p className="text-muted mb-0">Carregando...</p> : null}

            <div className="table-responsive lanc-desktop">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Motivo</th>
                    <th>Unidade</th>
                    <th>Meio</th>
                    <th className="text-right">Valor</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {!carregando && visiveis.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        Nenhum lançamento encontrado.
                      </td>
                    </tr>
                  ) : (
                    visiveis.map((item) => {
                      const entrada = item.tipo === "entrada";
                      const badge = entrada
                        ? "badge-entrada"
                        : item.natureza === "fixa"
                          ? "badge-fixa"
                          : "badge-variavel";
                      const rotulo = entrada ? "Entrada" : item.natureza === "fixa" ? "Fixa" : "Variável";
                      return (
                        <tr key={item.id}>
                          <td className="text-nowrap small text-muted">{fmtData(item.data)}</td>
                          <td>
                            <button
                              type="button"
                              className="lanc-motivo"
                              onClick={() => setDetalhe(item)}
                            >
                              {item.motivo}
                            </button>
                            <span className={`badge ${badge} mr-1`}>{rotulo}</span>
                            {item.status === "pendente" ? (
                              <span className="badge badge-pendente mr-1">Pendente</span>
                            ) : null}
                            {item.origem === "caixa" ? (
                              <span className="badge badge-caixa mr-1">Caixa</span>
                            ) : null}
                            <span className="text-muted small">{item.categoria}</span>
                          </td>
                          <td>
                            <span className="badge badge-light border">{item.unidade}</span>
                          </td>
                          <td className="small">{meioExibido(item)}</td>
                          <td
                            className="text-right font-weight-bold text-nowrap"
                            style={{ color: entrada ? "#1e7e34" : "#2b2330" }}
                          >
                            {entrada ? "+" : "−"} {fmtMoeda(item.valor)}
                          </td>
                          <td className="text-right">
                            {item.origem === "caixa" ? null : (
                              <button
                                type="button"
                                className="btn btn-link text-danger p-0"
                                onClick={() => void excluir(item)}
                                title="Excluir"
                              >
                                <i className="fas fa-trash" aria-hidden />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="lanc-mobile">
              {!carregando && visiveis.length === 0 ? (
                <p className="text-center text-muted">Nenhum lançamento encontrado.</p>
              ) : (
                visiveis.map((item) => {
                  const entrada = item.tipo === "entrada";
                  const badge = entrada
                    ? "badge-entrada"
                    : item.natureza === "fixa"
                      ? "badge-fixa"
                      : "badge-variavel";
                  const rotulo = entrada ? "Entrada" : item.natureza === "fixa" ? "Fixa" : "Variável";
                  return (
                    <article key={item.id} className={`lanc-tx ${entrada ? "is-entrada" : ""}`}>
                      <div className="d-flex justify-content-between">
                        <div>
                          <span className={`badge ${badge} mr-1`}>{rotulo}</span>
                          <span className="badge badge-light border">{item.unidade}</span>
                        </div>
                        <strong style={{ color: entrada ? "#1e7e34" : "#2b2330" }}>
                          {entrada ? "+" : "−"} {fmtMoeda(item.valor)}
                        </strong>
                      </div>
                      <button
                        type="button"
                        className="lanc-motivo mt-1"
                        onClick={() => setDetalhe(item)}
                      >
                        {item.motivo}
                      </button>
                      <div className="d-flex justify-content-between align-items-center border-top mt-2 pt-2 small text-muted">
                        <span>
                          {fmtData(item.data)} · {meioExibido(item)}
                        </span>
                        {item.origem === "caixa" ? null : (
                          <button
                            type="button"
                            className="btn btn-link btn-sm text-danger p-0"
                            onClick={() => void excluir(item)}
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>

      {aviso ? (
        <div className="lanc-toast" role="status">
          {aviso}
        </div>
      ) : null}

      {detalhe ? (
        <div
          className="lanc-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lanc-detalhe-titulo"
          onClick={() => setDetalhe(null)}
        >
          <div className="lanc-modal-card lanc-detalhe" onClick={(e) => e.stopPropagation()}>
            <h3 id="lanc-detalhe-titulo">{detalhe.tipo === "entrada" ? "Entrada" : "Saída"}</h3>
            <p className="lanc-detalhe-motivo">{detalhe.motivo}</p>
            <dl>
              <div>
                <dt>Data</dt>
                <dd>{fmtData(detalhe.data)}</dd>
              </div>
              <div>
                <dt>Unidade</dt>
                <dd>{detalhe.unidade}</dd>
              </div>
              <div>
                <dt>Categoria</dt>
                <dd>{detalhe.categoria}</dd>
              </div>
              <div>
                <dt>Classificação</dt>
                <dd>
                  {detalhe.tipo === "entrada"
                    ? "Receita"
                    : detalhe.natureza === "fixa"
                      ? "Despesa fixa"
                      : "Despesa variável"}
                </dd>
              </div>
              <div>
                <dt>Meio de pagamento</dt>
                <dd>
                  {detalhe.meio2 && detalhe.valor1 != null && detalhe.valor2 != null ? (
                    <>
                      {detalhe.meio}: {fmtMoeda(detalhe.valor1)}
                      <br />
                      {detalhe.meio2}: {fmtMoeda(detalhe.valor2)}
                    </>
                  ) : (
                    meioExibido(detalhe)
                  )}
                </dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>{fmtMoeda(detalhe.valor)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{detalhe.status === "pendente" ? "Pendente / agendado" : "Pago / efetivado"}</dd>
              </div>
              <div>
                <dt>Origem</dt>
                <dd>{detalhe.origem === "caixa" ? "Caixa" : "Manual"}</dd>
              </div>
              {detalhe.observacao ? (
                <div>
                  <dt>Observação</dt>
                  <dd>{detalhe.observacao}</dd>
                </div>
              ) : null}
            </dl>
            <div className="lanc-modal-acoes">
              <button type="button" className="btn btn-light" onClick={() => setDetalhe(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
