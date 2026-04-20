"use client";

import {
  compararComSistema,
  type EsperadoCaixa,
  type LinhaDivergencia,
} from "@/lib/financeiro/caixa-comparacao";
import { useCallback, useEffect, useId, useState } from "react";

function parseMoneyCliente(v: string): number {
  const t = v.trim().replace(/\s/g, "");
  if (t === "") return 0;
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  let normalized: string;
  if (lastComma !== -1 && lastComma > lastDot) {
    normalized = t.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = t.replace(/,/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

/** Exibe valor monetário para edição (pt-BR). */
function fmtMoedaInput(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDataHora(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type SessaoJson = {
  data_referencia: string;
  tem_abertura: boolean;
  tem_fechamento: boolean;
  abertura: {
    id: number;
    numero_caixa: string;
    data_lancamento: string;
    responsavel_nome: string;
  } | null;
  fechamento: {
    id: number;
    numero_caixa: string;
    data_lancamento: string;
    responsavel_nome: string;
  } | null;
  relatorio: {
    id: number;
    valor_dinheiro: number;
    valor_cartao_credito: number;
    valor_cartao_debito: number;
    valor_pix: number;
    criado_em: string;
  } | null;
};

type CaixaSessaoClientProps = {
  dataRef: string;
  onDataRefChange: (dataYmd: string) => void;
};

type ResumoDiaJson = {
  data: string;
  esperado: EsperadoCaixa;
  por_forma: { nome: string; total: number; bucket: string }[];
  error?: string;
};

export function CaixaSessaoClient({
  dataRef,
  onDataRefChange,
}: CaixaSessaoClientProps) {
  const modalFechamentoId = useId();
  const modalDivergenciaId = useId();
  const [sessao, setSessao] = useState<SessaoJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [abrindo, setAbrindo] = useState(false);
  const [modalFechar, setModalFechar] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [vDin, setVDin] = useState("0");
  const [vCc, setVCc] = useState("0");
  const [vCd, setVCd] = useState("0");
  const [vPix, setVPix] = useState("0");
  const [formErr, setFormErr] = useState<string | null>(null);

  const [resumoLoading, setResumoLoading] = useState(false);
  const [resumoErr, setResumoErr] = useState<string | null>(null);
  const [resumoEsperado, setResumoEsperado] = useState<EsperadoCaixa | null>(
    null,
  );
  const [resumoPorForma, setResumoPorForma] = useState<
    { nome: string; total: number; bucket: string }[]
  >([]);
  const [divergencias, setDivergencias] = useState<LinhaDivergencia[] | null>(
    null,
  );

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/financeiro/caixa/sessao?data=${encodeURIComponent(dataRef)}`,
      );
      const j = (await res.json()) as SessaoJson & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar sessão.");
      setSessao(j as SessaoJson);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
      setSessao(null);
    } finally {
      setLoading(false);
    }
  }, [dataRef]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!modalFechar) return;
    let cancelled = false;
    async function loadResumo() {
      setResumoLoading(true);
      setResumoErr(null);
      setResumoEsperado(null);
      setResumoPorForma([]);
      try {
        const res = await fetch(
          `/api/financeiro/caixa/resumo-dia?data=${encodeURIComponent(dataRef)}`,
        );
        const j = (await res.json()) as ResumoDiaJson & { error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(j.error ?? "Erro ao carregar resumo do dia.");
        const esp = j.esperado;
        setResumoEsperado(esp);
        setResumoPorForma(Array.isArray(j.por_forma) ? j.por_forma : []);
        setVDin(fmtMoedaInput(esp.dinheiro));
        setVCc(fmtMoedaInput(esp.cartao_credito));
        setVCd(fmtMoedaInput(esp.cartao_debito));
        setVPix(fmtMoedaInput(esp.pix));
      } catch (e) {
        if (cancelled) return;
        setResumoErr(
          e instanceof Error ? e.message : "Não foi possível carregar o resumo.",
        );
        setVDin(fmtMoedaInput(0));
        setVCc(fmtMoedaInput(0));
        setVCd(fmtMoedaInput(0));
        setVPix(fmtMoedaInput(0));
      } finally {
        if (!cancelled) setResumoLoading(false);
      }
    }
    void loadResumo();
    return () => {
      cancelled = true;
    };
  }, [modalFechar, dataRef]);

  async function abrirCaixa() {
    setAbrindo(true);
    setError(null);
    try {
      const res = await fetch("/api/financeiro/caixa/abertura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_referencia: dataRef, numero_caixa: "01" }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao abrir caixa.");
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao abrir.");
    } finally {
      setAbrindo(false);
    }
  }

  async function executarFechamento() {
    setFechando(true);
    setFormErr(null);
    try {
      const res = await fetch("/api/financeiro/caixa/fechamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_referencia: dataRef,
          valor_dinheiro: vDin,
          valor_cartao_credito: vCc,
          valor_cartao_debito: vCd,
          valor_pix: vPix,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao fechar caixa.");
      setModalFechar(false);
      setDivergencias(null);
      setVDin("0");
      setVCc("0");
      setVCd("0");
      setVPix("0");
      await carregar();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Erro ao fechar.");
    } finally {
      setFechando(false);
    }
  }

  function handleSubmitFechamento(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);

    const vd = parseMoneyCliente(vDin);
    const vcc = parseMoneyCliente(vCc);
    const vcd = parseMoneyCliente(vCd);
    const vp = parseMoneyCliente(vPix);
    if ([vd, vcc, vcd, vp].some((x) => Number.isNaN(x))) {
      setFormErr("Informe valores numéricos válidos (≥ 0).");
      return;
    }

    const informado = {
      dinheiro: vd,
      pix: vp,
      cartao_credito: vcc,
      cartao_debito: vcd,
    };

    if (resumoEsperado) {
      const divs = compararComSistema(resumoEsperado, informado);
      if (divs.length > 0) {
        setDivergencias(divs);
        return;
      }
    }

    void executarFechamento();
  }

  function confirmarFechamentoComDivergencia() {
    setDivergencias(null);
    void executarFechamento();
  }

  const podeFechar =
    sessao && sessao.tem_abertura && !sessao.tem_fechamento;
  const fechado = sessao?.tem_fechamento;

  return (
    <div className="card card-outline card-success mb-4">
      <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h3 className="card-title mb-0">Sessão de caixa</h3>
        <div className="d-flex align-items-center gap-2">
          <label className="mb-0 small text-muted" htmlFor="caixa-data-ref">
            Data
          </label>
          <input
            id="caixa-data-ref"
            type="date"
            className="form-control form-control-sm"
            style={{ width: "160px" }}
            value={dataRef}
            onChange={(e) => onDataRefChange(e.target.value)}
          />
        </div>
      </div>
      <div className="card-body">
        {error ? (
          <div className="alert alert-danger py-2 small mb-3">{error}</div>
        ) : null}

        {loading ? (
          <p className="text-muted mb-0">Carregando…</p>
        ) : sessao ? (
          <>
            {!sessao.tem_abertura ? (
              <div className="alert alert-warning mb-3 py-3">
                <strong>Caixa não aberto</strong> nesta data. Abra o caixa para
                registrar o início das operações do dia.
                <div className="mt-2">
                  <button
                    type="button"
                    className="btn btn-success"
                    disabled={abrindo}
                    onClick={() => void abrirCaixa()}
                  >
                    {abrindo ? "Abrindo…" : "Abrir caixa"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="alert alert-info mb-3 py-2 small">
                <strong>Abertura:</strong>{" "}
                {fmtDataHora(sessao.abertura!.data_lancamento)} —{" "}
                {sessao.abertura!.responsavel_nome} (caixa{" "}
                {sessao.abertura!.numero_caixa})
              </div>
            )}

            {podeFechar ? (
              <div className="mb-3">
                <p className="mb-2">
                  O caixa está <strong>aberto</strong>. Ao fechar, informe os
                  valores para conferência e gere o relatório do dia.
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setFormErr(null);
                    setDivergencias(null);
                    setModalFechar(true);
                  }}
                >
                  Fechar caixa e gerar relatório
                </button>
              </div>
            ) : null}

            {fechado && sessao.fechamento ? (
              <div className="border rounded p-3 bg-light">
                <h4 className="h6 text-success mb-2">
                  <i className="fas fa-lock mr-1" aria-hidden />
                  Caixa fechado
                </h4>
                <p className="small mb-2 text-muted">
                  Fechamento em {fmtDataHora(sessao.fechamento.data_lancamento)}{" "}
                  por {sessao.fechamento.responsavel_nome}.
                </p>
                {sessao.relatorio ? (
                  <div className="table-responsive">
                    <table className="table table-sm table-bordered mb-0 bg-white">
                      <thead className="thead-light">
                        <tr>
                          <th>Meio</th>
                          <th className="text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Dinheiro</td>
                          <td className="text-right">
                            {fmtBrl(sessao.relatorio.valor_dinheiro)}
                          </td>
                        </tr>
                        <tr>
                          <td>Cartão de crédito</td>
                          <td className="text-right">
                            {fmtBrl(sessao.relatorio.valor_cartao_credito)}
                          </td>
                        </tr>
                        <tr>
                          <td>Cartão de débito</td>
                          <td className="text-right">
                            {fmtBrl(sessao.relatorio.valor_cartao_debito)}
                          </td>
                        </tr>
                        <tr>
                          <td>Pix</td>
                          <td className="text-right">
                            {fmtBrl(sessao.relatorio.valor_pix)}
                          </td>
                        </tr>
                        <tr className="font-weight-bold">
                          <td>Total</td>
                          <td className="text-right">
                            {fmtBrl(
                              sessao.relatorio.valor_dinheiro +
                                sessao.relatorio.valor_cartao_credito +
                                sessao.relatorio.valor_cartao_debito +
                                sessao.relatorio.valor_pix,
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="small text-muted mb-0 mt-2">
                      Relatório registrado em{" "}
                      {fmtDataHora(sessao.relatorio.criado_em)}.
                    </p>
                  </div>
                ) : (
                  <p className="text-muted small mb-0">
                    Relatório não encontrado (contate o suporte).
                  </p>
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {modalFechar ? (
        <>
          <div
            className="modal fade show"
            style={{ display: "block" }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalFechamentoId}
          >
            <div className="modal-dialog" role="document">
              <form
                className="modal-content"
                onSubmit={(e) => void handleSubmitFechamento(e)}
              >
                <div className="modal-header">
                  <h5 className="modal-title" id={modalFechamentoId}>
                    Fechar caixa — {dataRef}
                  </h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={() => !fechando && setModalFechar(false)}
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
                <div className="modal-body">
                  <p className="small text-muted mb-2">
                    Compare os totais registrados no sistema (pagamentos quitados
                    neste dia) com os valores que você conferiu fisicamente.
                  </p>
                  {resumoLoading ? (
                    <p className="small text-muted mb-3">Carregando resumo…</p>
                  ) : null}
                  {resumoErr ? (
                    <div className="alert alert-warning py-2 small mb-3" role="alert">
                      {resumoErr} O fechamento pode ser salvo sem conferência
                      automática com o sistema.
                    </div>
                  ) : null}
                  {formErr ? (
                    <div className="alert alert-danger py-2 small mb-3" role="alert">
                      {formErr}
                    </div>
                  ) : null}
                  {resumoEsperado && resumoEsperado.outros > 0 ? (
                    <div className="alert alert-light border py-2 small mb-3">
                      Há{" "}
                      <strong>{fmtBrl(resumoEsperado.outros)}</strong> em formas
                      agrupadas como &quot;outros&quot; no sistema. Ajuste o
                      agrupamento em Tipos de pagamento se precisar incluí-las nos
                      quatro meios abaixo.
                    </div>
                  ) : null}
                  <div className="table-responsive mb-3">
                    <table className="table table-sm table-bordered mb-0 bg-white">
                      <thead className="thead-light">
                        <tr>
                          <th>Meio</th>
                          <th className="text-right">No sistema</th>
                          <th style={{ minWidth: "140px" }}>Conferido</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Dinheiro</td>
                          <td className="text-right text-muted">
                            {resumoEsperado
                              ? fmtBrl(resumoEsperado.dinheiro)
                              : "—"}
                          </td>
                          <td>
                            <input
                              id="cx-din"
                              className="form-control form-control-sm"
                              inputMode="decimal"
                              value={vDin}
                              onChange={(e) => setVDin(e.target.value)}
                              disabled={resumoLoading}
                              required
                              aria-label="Dinheiro conferido"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td>Pix</td>
                          <td className="text-right text-muted">
                            {resumoEsperado ? fmtBrl(resumoEsperado.pix) : "—"}
                          </td>
                          <td>
                            <input
                              id="cx-pix"
                              className="form-control form-control-sm"
                              inputMode="decimal"
                              value={vPix}
                              onChange={(e) => setVPix(e.target.value)}
                              disabled={resumoLoading}
                              required
                              aria-label="Pix conferido"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td>Cartão de crédito</td>
                          <td className="text-right text-muted">
                            {resumoEsperado
                              ? fmtBrl(resumoEsperado.cartao_credito)
                              : "—"}
                          </td>
                          <td>
                            <input
                              id="cx-cc"
                              className="form-control form-control-sm"
                              inputMode="decimal"
                              value={vCc}
                              onChange={(e) => setVCc(e.target.value)}
                              disabled={resumoLoading}
                              required
                              aria-label="Cartão de crédito conferido"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td>Cartão de débito</td>
                          <td className="text-right text-muted">
                            {resumoEsperado
                              ? fmtBrl(resumoEsperado.cartao_debito)
                              : "—"}
                          </td>
                          <td>
                            <input
                              id="cx-cd"
                              className="form-control form-control-sm"
                              inputMode="decimal"
                              value={vCd}
                              onChange={(e) => setVCd(e.target.value)}
                              disabled={resumoLoading}
                              required
                              aria-label="Cartão de débito conferido"
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {resumoPorForma.length > 0 ? (
                    <details className="small mb-0">
                      <summary className="text-muted cursor-pointer">
                        Detalhe por forma de pagamento
                      </summary>
                      <div className="table-responsive mt-2">
                        <table className="table table-sm table-bordered mb-0">
                          <thead className="thead-light">
                            <tr>
                              <th>Forma</th>
                              <th className="text-right">Total</th>
                              <th>Grupo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {resumoPorForma.map((row) => (
                              <tr key={row.nome}>
                                <td>{row.nome}</td>
                                <td className="text-right">{fmtBrl(row.total)}</td>
                                <td className="text-muted small">{row.bucket}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ) : null}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={fechando}
                    onClick={() => setModalFechar(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={fechando || resumoLoading}
                  >
                    {fechando ? "Fechando…" : "Confirmar fechamento"}
                  </button>
                </div>
              </form>
            </div>
          </div>
          <div
            className="modal-backdrop fade show"
            role="presentation"
            onClick={() => !fechando && !divergencias && setModalFechar(false)}
          />
        </>
      ) : null}

      {divergencias && divergencias.length > 0 ? (
        <>
          <div
            className="modal fade show"
            style={{ display: "block", zIndex: 1060 }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalDivergenciaId}
          >
            <div className="modal-dialog" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title" id={modalDivergenciaId}>
                    Valores diferentes do sistema
                  </h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={() => !fechando && setDivergencias(null)}
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
                <div className="modal-body">
                  <p className="small mb-2">
                    Os valores informados não batem com a soma dos pagamentos
                    quitados no dia no sistema. Confira a tabela abixo. Você pode
                    voltar para ajustar ou salvar o fechamento assim mesmo.
                  </p>
                  <div className="table-responsive">
                    <table className="table table-sm table-bordered mb-0">
                      <thead className="thead-light">
                        <tr>
                          <th>Meio</th>
                          <th className="text-right">Sistema</th>
                          <th className="text-right">Informado</th>
                          <th className="text-right">Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {divergencias.map((d) => (
                          <tr key={d.chave}>
                            <td>{d.rotulo}</td>
                            <td className="text-right">{fmtBrl(d.sistema)}</td>
                            <td className="text-right">{fmtBrl(d.informado)}</td>
                            <td className="text-right">
                              {fmtBrl(Math.abs(d.diferenca))}
                              {d.diferenca > 0 ? (
                                <span className="text-success small d-block">
                                  (sobra)
                                </span>
                              ) : d.diferenca < 0 ? (
                                <span className="text-danger small d-block">
                                  (falta)
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={fechando}
                    onClick={() => setDivergencias(null)}
                  >
                    Voltar e ajustar
                  </button>
                  <button
                    type="button"
                    className="btn btn-warning"
                    disabled={fechando}
                    onClick={() => confirmarFechamentoComDivergencia()}
                  >
                    {fechando ? "Salvando…" : "Salvar mesmo assim"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div
            className="modal-backdrop fade show"
            style={{ zIndex: 1055 }}
            role="presentation"
            onClick={() => !fechando && setDivergencias(null)}
          />
        </>
      ) : null}
    </div>
  );
}
