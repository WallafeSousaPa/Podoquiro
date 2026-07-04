"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type MovimentoRow = {
  id: number;
  data_movimentacao: string;
  data_vencimento: string | null;
  descricao: string;
  tipo_entrada: string;
  forma_pagamento: string;
  parcela: string | null;
  valor: number;
  atendimento_id: number | null;
  id_pagamento: number | null;
};

type ApiResponse = {
  data?: MovimentoRow[];
  totais?: { entradas: number; saidas: number; saldo: number };
  saldo_atual?: number;
  formas_pagamento?: string[];
  error?: string;
};

function fmtMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function labelTipoEntrada(tipo: string): string {
  if (tipo === "atendimento") return "Atendimento";
  if (tipo === "caixa_relatorio") return "Fechamento caixa";
  if (tipo === "taxa_agendamento") return "Taxa agendamento";
  if (tipo === "fundo_caixa") return "Fundo de caixa";
  return tipo;
}

export function CaixaMovimentoClient() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [lista, setLista] = useState<MovimentoRow[]>([]);
  const [totais, setTotais] = useState({ entradas: 0, saidas: 0, saldo: 0 });
  const [saldoAtual, setSaldoAtual] = useState(0);
  const [formasOpcoes, setFormasOpcoes] = useState<string[]>([]);

  const [dataDe, setDataDe] = useState(hojeLocal);
  const [dataAte, setDataAte] = useState(hojeLocal);
  const [tipoEntrada, setTipoEntrada] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [busca, setBusca] = useState("");
  const [atendimentoId, setAtendimentoId] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams({ de: dataDe, ate: dataAte });
      if (tipoEntrada) params.set("tipo_entrada", tipoEntrada);
      if (formaPagamento) params.set("forma_pagamento", formaPagamento);
      if (busca.trim()) params.set("busca", busca.trim());
      if (atendimentoId.trim()) params.set("atendimento_id", atendimentoId.trim());

      const res = await fetch(`/api/financeiro/caixa/movimento?${params.toString()}`, {
        credentials: "include",
      });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar movimentos.");
      setLista(json.data ?? []);
      setTotais(json.totais ?? { entradas: 0, saidas: 0, saldo: 0 });
      setSaldoAtual(json.saldo_atual ?? 0);
      if (json.formas_pagamento?.length) {
        setFormasOpcoes(json.formas_pagamento);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setLista([]);
    } finally {
      setCarregando(false);
    }
  }, [dataDe, dataAte, tipoEntrada, formaPagamento, busca, atendimentoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const resumoFormas = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of lista) {
      map.set(r.forma_pagamento, (map.get(r.forma_pagamento) ?? 0) + r.valor);
    }
    return [...map.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
  }, [lista]);

  return (
    <div className="card card-outline card-primary">
      <div className="card-header">
        <h3 className="card-title mb-0">Movimentação do caixa</h3>
      </div>
      <div className="card-body p-0">
        <div className="border-bottom p-3">
          <p className="text-muted small mb-3">
            Entradas registradas automaticamente ao baixar pagamentos de atendimentos no Caixa.
            Saídas serão incluídas em versões futuras.
          </p>
          <div className="form-row align-items-end">
            <div className="col-6 col-md-2 form-group mb-2">
              <label className="small mb-1" htmlFor="cm-de">
                De
              </label>
              <input
                id="cm-de"
                type="date"
                className="form-control form-control-sm"
                value={dataDe}
                max={dataAte || undefined}
                onChange={(e) => setDataDe(e.target.value)}
              />
            </div>
            <div className="col-6 col-md-2 form-group mb-2">
              <label className="small mb-1" htmlFor="cm-ate">
                Até
              </label>
              <input
                id="cm-ate"
                type="date"
                className="form-control form-control-sm"
                value={dataAte}
                min={dataDe || undefined}
                onChange={(e) => setDataAte(e.target.value)}
              />
            </div>
            <div className="col-6 col-md-2 form-group mb-2">
              <label className="small mb-1" htmlFor="cm-tipo">
                Tipo
              </label>
              <select
                id="cm-tipo"
                className="form-control form-control-sm"
                value={tipoEntrada}
                onChange={(e) => setTipoEntrada(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="atendimento">Atendimento</option>
                <option value="caixa_relatorio">Fechamento caixa</option>
                <option value="taxa_agendamento">Taxa agendamento</option>
                <option value="fundo_caixa">Fundo de caixa</option>
              </select>
            </div>
            <div className="col-6 col-md-2 form-group mb-2">
              <label className="small mb-1" htmlFor="cm-forma">
                Forma pagamento
              </label>
              <select
                id="cm-forma"
                className="form-control form-control-sm"
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
              >
                <option value="">Todas</option>
                {formasOpcoes.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-2 form-group mb-2">
              <label className="small mb-1" htmlFor="cm-atendimento">
                Atendimento #
              </label>
              <input
                id="cm-atendimento"
                type="number"
                min={1}
                className="form-control form-control-sm"
                placeholder="ID"
                value={atendimentoId}
                onChange={(e) => setAtendimentoId(e.target.value)}
              />
            </div>
            <div className="col-12 col-md-2 form-group mb-2">
              <label className="small mb-1" htmlFor="cm-busca">
                Buscar
              </label>
              <input
                id="cm-busca"
                type="search"
                className="form-control form-control-sm"
                placeholder="Descrição ou forma"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="px-3 py-3 border-bottom">
          <div className="row align-items-stretch mb-0">
            <div className="col-lg-6 mb-3 mb-lg-0 d-flex">
              <div
                className="info-box bg-primary shadow mb-0 w-100"
                style={{ minHeight: "5.5rem" }}
              >
                <span className="info-box-icon elevation-1">
                  <i className="fas fa-wallet" aria-hidden />
                </span>
                <div className="info-box-content">
                  <span className="info-box-text text-uppercase font-weight-bold">
                    Saldo atual
                  </span>
                  <span
                    className="info-box-number font-weight-bold"
                    style={{ fontSize: "1.75rem", lineHeight: 1.2 }}
                  >
                    {fmtMoeda(saldoAtual)}
                  </span>
                  <span className="progress-description text-white-50 small">
                    Total acumulado do caixa, independente do período filtrado
                  </span>
                </div>
              </div>
            </div>
            <div className="col-6 col-lg-3 mb-3 mb-lg-0 d-flex">
              <div className="info-box bg-success mb-0 w-100">
                <span className="info-box-icon">
                  <i className="fas fa-arrow-down" aria-hidden />
                </span>
                <div className="info-box-content">
                  <span className="info-box-text">Entradas no período</span>
                  <span className="info-box-number">{fmtMoeda(totais.entradas)}</span>
                </div>
              </div>
            </div>
            <div className="col-6 col-lg-3 d-flex">
              <div className="info-box bg-danger mb-0 w-100">
                <span className="info-box-icon">
                  <i className="fas fa-arrow-up" aria-hidden />
                </span>
                <div className="info-box-content">
                  <span className="info-box-text">Saídas no período</span>
                  <span className="info-box-number">{fmtMoeda(totais.saidas)}</span>
                </div>
              </div>
            </div>
          </div>
          {resumoFormas.length > 0 ? (
            <div className="mt-2 small text-muted">
              Por forma:{" "}
              {resumoFormas.map((f, i) => (
                <span key={f.nome}>
                  {i > 0 ? " · " : ""}
                  {f.nome} ({fmtMoeda(f.total)})
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {erro ? (
          <div className="alert alert-danger m-3 mb-0" role="alert">
            {erro}
          </div>
        ) : null}

        {carregando ? (
          <p className="text-muted p-3 mb-0">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="text-muted p-3 mb-0">Nenhuma movimentação no período.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover table-striped mb-0">
              <thead>
                <tr>
                  <th>Data movimentação</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Forma pagamento</th>
                  <th>Vencimento</th>
                  <th>Parcela</th>
                  <th>Atendimento</th>
                  <th className="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDataHora(r.data_movimentacao)}</td>
                    <td>{r.descricao}</td>
                    <td>
                      <span className="badge badge-success">{labelTipoEntrada(r.tipo_entrada)}</span>
                    </td>
                    <td>{r.forma_pagamento}</td>
                    <td>{fmtData(r.data_vencimento)}</td>
                    <td>{r.parcela ?? "—"}</td>
                    <td>{r.atendimento_id ? `#${r.atendimento_id}` : "—"}</td>
                    <td className="text-right text-success font-weight-bold">
                      {fmtMoeda(r.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
