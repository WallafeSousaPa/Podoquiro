"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { calcularValorTotal } from "@/lib/agenda/totais";
import { dataReferenciaBrasilia } from "@/lib/financeiro/data-referencia-brasilia";
import {
  fmtMoedaBrCampo,
  parseMoedaBrCliente,
} from "@/lib/financeiro/moeda-br-input";
import type { CaixaAgendamentoRow } from "./caixa-client";

type ProcLinha = { id_procedimento: number; valor_aplicado: number };

type PagLinha = {
  id_forma_pagamento: number;
  id_maquineta: number | null;
  valor_pago: number;
  valor_texto: string;
};

type AgDetail = {
  id: number;
  id_usuario: number;
  data_hora_inicio: string;
  data_hora_fim: string;
  status: string;
  valor_bruto: number;
  desconto: number;
  valor_total: number;
  procedimentos: {
    id: number;
    id_procedimento: number;
    valor_aplicado: number;
  }[];
  pagamentos: {
    id: number;
    id_forma_pagamento: number;
    id_maquineta: number | null;
    valor_pago: number;
    status_pagamento: string;
  }[];
  permite_editar_procedimentos_e_pagamentos: boolean;
  pagamentos_nao_carregados_por_perfil: boolean;
};

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

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function badgeStatusAg(status: string) {
  const map: Record<string, string> = {
    pendente: "badge-warning",
    confirmado: "badge-primary",
    em_andamento: "badge-info",
    realizado: "badge-success",
    cancelado: "badge-secondary",
    adiado: "badge-primary",
  };
  const cls = map[status] ?? "badge-light";
  return (
    <span className={`badge ${cls}`}>{status.replace(/_/g, " ")}</span>
  );
}

type Props = {
  row: CaixaAgendamentoRow | null;
  /** Quando todos os pagamentos do agendamento já estão quitados — só visualização. */
  somenteVisualizar: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function ModalCaixaAgendamento({
  row,
  somenteVisualizar,
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const modalAbrirCaixaTitleId = useId();
  const abrirCaixaPromptRef = useRef<{ resolve: (aceita: boolean) => void } | null>(
    null,
  );
  const [modalAbrirCaixaAberto, setModalAbrirCaixaAberto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<AgDetail | null>(null);

  const [procedimentosCat, setProcedimentosCat] = useState<
    { id: number; procedimento: string; valor_total: number }[]
  >([]);
  const [formasPg, setFormasPg] = useState<{ id: number; nome: string }[]>([]);
  const [maquinetas, setMaquinetas] = useState<{ id: number; nome: string }[]>(
    [],
  );

  const [procedimentos, setProcedimentos] = useState<ProcLinha[]>([]);
  const [pagamentos, setPagamentos] = useState<PagLinha[]>([]);

  /** Situação do caixa no dia do agendamento (referência Brasília). */
  const [sessaoCaixa, setSessaoCaixa] = useState<{
    tem_abertura: boolean;
    tem_fechamento: boolean;
    nomeFech: string | null;
  } | null>(null);
  const [caixaBusy, setCaixaBusy] = useState(false);

  const carregarTudo = useCallback(async () => {
    if (!row) return;
    setLoading(true);
    setErro(null);
    setDetalhe(null);
    setSessaoCaixa(null);
    try {
      const res = await fetch(`/api/agendamentos/${row.id}`);
      const j = (await res.json()) as { data?: AgDetail; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar agendamento.");
      const d = j.data;
      if (!d) throw new Error("Resposta inválida.");
      setDetalhe(d);

      const [procRes, fpRes, mqRes] = await Promise.all([
        fetch(
          `/api/procedimentos?id_usuario=${encodeURIComponent(String(d.id_usuario))}`,
        ),
        fetch("/api/formas-pagamento"),
        fetch("/api/maquinetas"),
      ]);
      const procJ = (await procRes.json()) as {
        data?: { id: number; procedimento: string; valor_total: number }[];
        error?: string;
      };
      if (!procRes.ok) throw new Error(procJ.error ?? "Erro ao carregar procedimentos.");
      setProcedimentosCat(
        (procJ.data ?? []).map((p) => ({
          id: p.id,
          procedimento: p.procedimento,
          valor_total: Number(p.valor_total),
        })),
      );

      const fpJ = (await fpRes.json()) as {
        data?: { id: number; nome: string; ativo?: boolean }[];
        error?: string;
      };
      if (!fpRes.ok) throw new Error(fpJ.error ?? "Erro ao carregar formas.");
      setFormasPg(
        (fpJ.data ?? [])
          .filter((f) => f.ativo !== false)
          .map((f) => ({ id: f.id, nome: f.nome })),
      );

      const mqJ = (await mqRes.json()) as {
        data?: { id: number; nome: string; ativo?: boolean }[];
        error?: string;
      };
      if (!mqRes.ok) throw new Error(mqJ.error ?? "Erro ao carregar maquinetas.");
      setMaquinetas(
        (mqJ.data ?? [])
          .filter((m) => m.ativo !== false)
          .map((m) => ({ id: m.id, nome: m.nome })),
      );

      setProcedimentos(
        d.procedimentos.map((p) => ({
          id_procedimento: p.id_procedimento,
          valor_aplicado: Number(p.valor_aplicado),
        })),
      );
      setPagamentos(
        d.pagamentos.map((p) => {
          const vp = Number(p.valor_pago);
          return {
            id_forma_pagamento: p.id_forma_pagamento,
            id_maquineta: p.id_maquineta,
            valor_pago: vp,
            valor_texto: fmtMoedaBrCampo(vp),
          };
        }),
      );

      const dr = dataReferenciaBrasilia(d.data_hora_inicio);
      if (dr) {
        const sres = await fetch(
          `/api/financeiro/caixa/sessao?data=${encodeURIComponent(dr)}`,
        );
        const sj = (await sres.json()) as {
          tem_abertura?: boolean;
          tem_fechamento?: boolean;
          fechamento?: { responsavel_nome?: string };
        };
        if (sres.ok) {
          setSessaoCaixa({
            tem_abertura: Boolean(sj.tem_abertura),
            tem_fechamento: Boolean(sj.tem_fechamento),
            nomeFech: sj.fechamento?.responsavel_nome ?? null,
          });
        }
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [row]);

  useEffect(() => {
    if (row) void carregarTudo();
  }, [row, carregarTudo]);

  useEffect(() => {
    return () => {
      const p = abrirCaixaPromptRef.current;
      if (p) {
        abrirCaixaPromptRef.current = null;
        p.resolve(false);
      }
    };
  }, []);

  function responderModalAbrirCaixa(aceita: boolean) {
    const p = abrirCaixaPromptRef.current;
    abrirCaixaPromptRef.current = null;
    setModalAbrirCaixaAberto(false);
    p?.resolve(aceita);
  }

  function addProcLinha() {
    const primeiro = procedimentosCat[0];
    if (!primeiro) return;
    setProcedimentos((prev) => [
      ...prev,
      {
        id_procedimento: primeiro.id,
        valor_aplicado: primeiro.valor_total,
      },
    ]);
  }

  const garantirCaixaHabilitadoParaPagamento = useCallback(async (): Promise<boolean> => {
    if (!detalhe) return false;
    const dataRef = dataReferenciaBrasilia(detalhe.data_hora_inicio);
    if (!dataRef) {
      setErro("Não foi possível determinar o dia do agendamento para o caixa.");
      return false;
    }
    setErro(null);
    setCaixaBusy(true);
    try {
      const res = await fetch(
        `/api/financeiro/caixa/sessao?data=${encodeURIComponent(dataRef)}`,
      );
      const j = (await res.json()) as {
        tem_abertura?: boolean;
        tem_fechamento?: boolean;
        fechamento?: { responsavel_nome?: string } | null;
        error?: string;
      };
      if (!res.ok) {
        setErro(j.error ?? "Erro ao verificar o caixa.");
        return false;
      }
      const nomeFech = j.fechamento?.responsavel_nome ?? null;
      setSessaoCaixa({
        tem_abertura: Boolean(j.tem_abertura),
        tem_fechamento: Boolean(j.tem_fechamento),
        nomeFech,
      });
      if (j.tem_fechamento) {
        const n = nomeFech ? ` ${nomeFech}` : "";
        setErro(
          `O caixa deste dia já está fechado. Não é possível registrar pagamentos. Contate${n} ou o responsável pelo caixa.`,
        );
        return false;
      }
      if (!j.tem_abertura) {
        setCaixaBusy(false);
        const ok = await new Promise<boolean>((resolve) => {
          abrirCaixaPromptRef.current = { resolve };
          setModalAbrirCaixaAberto(true);
        });
        if (!ok) return false;
        setCaixaBusy(true);
        const post = await fetch("/api/financeiro/caixa/abertura", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data_referencia: dataRef, numero_caixa: "01" }),
        });
        const pj = (await post.json()) as { error?: string };
        if (!post.ok) {
          setErro(pj.error ?? "Não foi possível abrir o caixa.");
          return false;
        }
        const res2 = await fetch(
          `/api/financeiro/caixa/sessao?data=${encodeURIComponent(dataRef)}`,
        );
        const j2 = (await res2.json()) as typeof j;
        if (res2.ok) {
          setSessaoCaixa({
            tem_abertura: Boolean(j2.tem_abertura),
            tem_fechamento: Boolean(j2.tem_fechamento),
            nomeFech: j2.fechamento?.responsavel_nome ?? null,
          });
        }
        return true;
      }
      return true;
    } finally {
      setCaixaBusy(false);
    }
  }, [detalhe]);

  async function addPagLinha() {
    const primeira = formasPg[0];
    if (!primeira) return;
    const ok = await garantirCaixaHabilitadoParaPagamento();
    if (!ok) return;
    setPagamentos((prev) => [
      ...prev,
      {
        id_forma_pagamento: primeira.id,
        id_maquineta: null,
        valor_pago: 0,
        valor_texto: fmtMoedaBrCampo(0),
      },
    ]);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!row || !detalhe || !detalhe.permite_editar_procedimentos_e_pagamentos) return;
    if (somenteVisualizar) return;
    if (procedimentos.length === 0) {
      setErro("Informe ao menos um procedimento.");
      return;
    }

    const vb =
      Math.round(
        procedimentos.reduce((s, p) => s + p.valor_aplicado, 0) * 100,
      ) / 100;
    const totalEsperado = calcularValorTotal(vb, detalhe.desconto);
    const somaPg =
      Math.round(
        pagamentos.reduce(
          (s, p) => s + (Number.isFinite(p.valor_pago) ? p.valor_pago : 0),
          0,
        ) * 100,
      ) / 100;

    if (detalhe.status === "realizado") {
      if (Math.abs(somaPg - totalEsperado) > 0.02) {
        setErro(
          `A soma dos pagamentos (${fmtBrl(somaPg)}) deve ser igual ao total do agendamento (${fmtBrl(totalEsperado)}): soma dos procedimentos${detalhe.desconto > 0 ? ` com ${detalhe.desconto}% de desconto` : ""}. Ajuste os valores antes de salvar.`,
        );
        return;
      }
      const caixaOk = await garantirCaixaHabilitadoParaPagamento();
      if (!caixaOk) return;
    }

    setSalvando(true);
    setErro(null);
    try {
      const body: Record<string, unknown> = { procedimentos };
      if (detalhe.status === "realizado") {
        body.pagamentos = pagamentos.map(
          ({ id_forma_pagamento, id_maquineta, valor_pago }) => ({
            id_forma_pagamento,
            id_maquineta,
            valor_pago,
            status_pagamento: "pago",
          }),
        );
      }
      const res = await fetch(`/api/agendamentos/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao salvar.");
      onSaved();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const podeEditar = detalhe?.permite_editar_procedimentos_e_pagamentos === true;
  const pagamentosOcultos = detalhe?.pagamentos_nao_carregados_por_perfil === true;
  const somenteLeitura = !podeEditar || somenteVisualizar;
  const podeEditarFormulario = podeEditar && !somenteVisualizar;
  const agendamentoConcluido = detalhe?.status === "realizado";
  const podeEditarPagamentos = podeEditarFormulario && agendamentoConcluido;

  const somaProcedimentos = useMemo(
    () =>
      Math.round(
        procedimentos.reduce((s, p) => s + p.valor_aplicado, 0) * 100,
      ) / 100,
    [procedimentos],
  );

  const totalEsperadoRecebimento = useMemo(() => {
    if (!detalhe) return 0;
    return calcularValorTotal(somaProcedimentos, detalhe.desconto);
  }, [detalhe, somaProcedimentos]);

  const somaPagamentos = useMemo(
    () =>
      Math.round(
        pagamentos.reduce(
          (s, p) => s + (Number.isFinite(p.valor_pago) ? p.valor_pago : 0),
          0,
        ) * 100,
      ) / 100,
    [pagamentos],
  );

  const pagamentosBatendoTotal =
    Math.abs(somaPagamentos - totalEsperadoRecebimento) <= 0.02;

  if (!row) return null;

  function nomeProcedimento(idProc: number) {
    const c = procedimentosCat.find((x) => x.id === idProc);
    return c?.procedimento ?? `Procedimento #${idProc}`;
  }

  function nomeForma(id: number) {
    return formasPg.find((f) => f.id === id)?.nome ?? `#${id}`;
  }

  function nomeMaquineta(id: number | null) {
    if (id == null) return "—";
    return maquinetas.find((m) => m.id === id)?.nome ?? `#${id}`;
  }

  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block", zIndex: 1055 }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-dialog modal-lg modal-caixa-ag" role="document">
          <div className="modal-content">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!podeEditarFormulario) return;
                void salvar(e);
              }}
            >
              <div className="modal-header">
                <h5 className="modal-title" id={titleId}>
                  Agendamento #{row.id}
                </h5>
                <button
                  type="button"
                  className="close"
                  disabled={salvando}
                  onClick={onClose}
                  aria-label="Fechar"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                {loading ? (
                  <p className="text-muted mb-0">Carregando…</p>
                ) : erro && !detalhe ? (
                  <div className="alert alert-danger py-2 small mb-0" role="alert">
                    {erro}
                  </div>
                ) : detalhe ? (
                  <>
                    <p className="mb-2">
                      <strong>{row.paciente_nome}</strong>
                    </p>
                    <ul className="small text-muted pl-3 mb-3">
                      <li>Início: {fmtDataHora(detalhe.data_hora_inicio)}</li>
                      <li>Término: {fmtDataHora(detalhe.data_hora_fim)}</li>
                      <li>Sala: {row.nome_sala}</li>
                      <li>Profissional: {row.profissional_nome}</li>
                      <li>Status: {badgeStatusAg(detalhe.status)}</li>
                    </ul>

                    {podeEditar && somenteVisualizar ? (
                      <div className="alert alert-info py-2 small mb-3" role="status">
                        Todos os pagamentos deste agendamento estão quitados. Você pode
                        apenas visualizar os dados.
                      </div>
                    ) : null}

                    {!podeEditar ? (
                      <div className="alert alert-warning py-2 small mb-3">
                        {pagamentosOcultos
                          ? "Seu perfil na agenda só permite alterar o status do atendimento. Para lançar procedimentos e pagamentos, use um usuário com permissão de caixa/agenda completa."
                          : "Você não tem permissão para alterar procedimentos ou pagamentos deste agendamento (por exemplo, agendamento de outro profissional)."}
                      </div>
                    ) : null}

                    {erro && detalhe ? (
                      <div className="alert alert-danger py-2 small" role="alert">
                        {erro}
                      </div>
                    ) : null}

                    {podeEditarFormulario &&
                    detalhe &&
                    !pagamentosOcultos &&
                    !agendamentoConcluido ? (
                      <div className="alert alert-secondary border py-2 small mb-3" role="status">
                        <strong>Pagamentos:</strong> só é possível incluir ou alterar
                        pagamentos quando o agendamento estiver{" "}
                        <strong>concluído</strong> (status <strong>Realizado</strong>).
                        Conclua o atendimento na agenda antes de lançar valores aqui.
                      </div>
                    ) : null}

                    {somenteLeitura && detalhe ? (
                      <>
                        <hr />
                        <strong className="d-block mb-2">Procedimentos</strong>
                        <ul className="small mb-3">
                          {detalhe.procedimentos.length === 0 ? (
                            <li className="text-muted">—</li>
                          ) : (
                            detalhe.procedimentos.map((p) => (
                              <li key={p.id}>
                                {nomeProcedimento(p.id_procedimento)} —{" "}
                                {fmtBrl(Number(p.valor_aplicado))}
                              </li>
                            ))
                          )}
                        </ul>
                        {!pagamentosOcultos ? (
                          <>
                            <strong className="d-block mb-2">Pagamentos</strong>
                            <p className="small text-muted mb-2">
                              No caixa, novos lançamentos são sempre registrados como{" "}
                              <strong>pago</strong>.
                            </p>
                            <ul className="small mb-0">
                              {detalhe.pagamentos.length === 0 ? (
                                <li className="text-muted">—</li>
                              ) : (
                                detalhe.pagamentos.map((p) => (
                                  <li key={p.id}>
                                    {fmtBrl(Number(p.valor_pago))} ·{" "}
                                    {nomeForma(p.id_forma_pagamento)}
                                    {p.id_maquineta != null
                                      ? ` · ${nomeMaquineta(p.id_maquineta)}`
                                      : ""}{" "}
                                    ·{" "}
                                    <span className="badge badge-success">
                                      {p.status_pagamento}
                                    </span>
                                  </li>
                                ))
                              )}
                            </ul>
                          </>
                        ) : null}
                      </>
                    ) : null}

                    {podeEditarFormulario ? (
                      <>
                        <hr />
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <strong>Procedimentos</strong>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={addProcLinha}
                            disabled={procedimentosCat.length === 0}
                          >
                            + Procedimento
                          </button>
                        </div>
                        {procedimentosCat.length === 0 ? (
                          <p className="small text-muted">
                            Nenhum procedimento liberado para este profissional.
                          </p>
                        ) : (
                          procedimentos.map((linha, idx) => (
                            <div key={idx} className="form-row align-items-end mb-2">
                              <div className="form-group col-md-7 mb-0">
                                <label className="small">Procedimento</label>
                                <select
                                  className="form-control form-control-sm"
                                  value={linha.id_procedimento || ""}
                                  onChange={(e) => {
                                    const id = Number(e.target.value);
                                    const pr = procedimentosCat.find((p) => p.id === id);
                                    setProcedimentos((prev) =>
                                      prev.map((p, i) =>
                                        i === idx
                                          ? {
                                              ...p,
                                              id_procedimento: id,
                                              valor_aplicado:
                                                pr?.valor_total ?? p.valor_aplicado,
                                            }
                                          : p,
                                      ),
                                    );
                                  }}
                                >
                                  {procedimentosCat.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.procedimento}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="form-group col-md-4 mb-0">
                                <label className="small">Valor aplicado</label>
                                <input
                                  type="text"
                                  readOnly
                                  className="form-control form-control-sm bg-light"
                                  value={linha.valor_aplicado.toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                />
                              </div>
                              <div className="form-group col-md-1 mb-0">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() =>
                                    setProcedimentos((prev) =>
                                      prev.filter((_, i) => i !== idx),
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))
                        )}

                        {podeEditarFormulario && !pagamentosOcultos && !agendamentoConcluido ? (
                          <>
                            <hr />
                            <strong className="d-block mb-2">Pagamentos (somente leitura)</strong>
                            <p className="small text-muted mb-2">
                              Enquanto o status não for Realizado, os pagamentos não podem
                              ser alterados aqui.
                            </p>
                            <ul className="small mb-0">
                              {pagamentos.length === 0 ? (
                                <li className="text-muted">—</li>
                              ) : (
                                pagamentos.map((p, idx) => (
                                  <li key={idx}>
                                    {fmtBrl(p.valor_pago)} · {nomeForma(p.id_forma_pagamento)}
                                    {p.id_maquineta != null
                                      ? ` · ${nomeMaquineta(p.id_maquineta)}`
                                      : ""}
                                  </li>
                                ))
                              )}
                            </ul>
                          </>
                        ) : null}

                        {podeEditarPagamentos && !pagamentosOcultos ? (
                          <>
                            <hr />
                            {sessaoCaixa?.tem_fechamento ? (
                              <div className="alert alert-danger py-2 small mb-0" role="alert">
                                O caixa deste dia já está <strong>fechado</strong>. Não é
                                possível registrar ou alterar pagamentos neste agendamento.
                                Contate{" "}
                                {sessaoCaixa.nomeFech ? (
                                  <strong>{sessaoCaixa.nomeFech}</strong>
                                ) : (
                                  "o responsável"
                                )}{" "}
                                pelo caixa ou a administração.
                              </div>
                            ) : (
                              <>
                                <div className="border rounded bg-light p-2 small mb-3">
                              <div className="d-flex flex-wrap justify-content-between gap-2">
                                <span>
                                  <strong>Soma dos procedimentos (bruto):</strong>{" "}
                                  {fmtBrl(somaProcedimentos)}
                                </span>
                                {detalhe.desconto > 0 ? (
                                  <span className="text-muted">
                                    Desconto: {detalhe.desconto}% →{" "}
                                    <strong>Total a receber:</strong>{" "}
                                    {fmtBrl(totalEsperadoRecebimento)}
                                  </span>
                                ) : (
                                  <span>
                                    <strong>Total a receber:</strong>{" "}
                                    {fmtBrl(totalEsperadoRecebimento)}
                                  </span>
                                )}
                              </div>
                              <div
                                className={`mt-2 mb-0 ${pagamentosBatendoTotal ? "text-success" : "text-danger"}`}
                              >
                                <strong>Soma dos pagamentos:</strong>{" "}
                                {fmtBrl(somaPagamentos)}
                                {!pagamentosBatendoTotal ? (
                                  <span className="d-inline-block ml-1">
                                    — deve igualar {fmtBrl(totalEsperadoRecebimento)}
                                  </span>
                                ) : (
                                  <span className="d-inline-block ml-1">✓</span>
                                )}
                              </div>
                            </div>
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <strong>Pagamentos</strong>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => void addPagLinha()}
                                disabled={formasPg.length === 0 || caixaBusy}
                              >
                                {caixaBusy ? "Verificando caixa…" : "+ Pagamento"}
                              </button>
                            </div>
                            {pagamentos.map((linha, idx) => (
                              <div key={idx} className="form-row align-items-end mb-2">
                                <div className="form-group col-md-4 mb-0">
                                  <label className="small">Forma</label>
                                  <select
                                    className="form-control form-control-sm"
                                    value={linha.id_forma_pagamento || ""}
                                    onChange={(e) => {
                                      const v = Number(e.target.value);
                                      setPagamentos((prev) =>
                                        prev.map((p, i) =>
                                          i === idx
                                            ? { ...p, id_forma_pagamento: v }
                                            : p,
                                        ),
                                      );
                                    }}
                                  >
                                    {formasPg.map((f) => (
                                      <option key={f.id} value={f.id}>
                                        {f.nome}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="form-group col-md-4 mb-0">
                                  <label className="small">Maquineta</label>
                                  <select
                                    className="form-control form-control-sm"
                                    value={linha.id_maquineta ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setPagamentos((prev) =>
                                        prev.map((p, i) =>
                                          i === idx
                                            ? {
                                                ...p,
                                                id_maquineta:
                                                  v === "" ? null : Number(v),
                                              }
                                            : p,
                                        ),
                                      );
                                    }}
                                  >
                                    <option value="">—</option>
                                    {maquinetas.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.nome}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="form-group col-md-3 mb-0">
                                  <label className="small">Valor (R$)</label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    className="form-control form-control-sm"
                                    value={linha.valor_texto}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const n = parseMoedaBrCliente(raw);
                                      setPagamentos((prev) =>
                                        prev.map((p, i) =>
                                          i === idx
                                            ? {
                                                ...p,
                                                valor_texto: raw,
                                                valor_pago: Number.isNaN(n)
                                                  ? p.valor_pago
                                                  : n,
                                              }
                                            : p,
                                        ),
                                      );
                                    }}
                                    onBlur={() => {
                                      setPagamentos((prev) =>
                                        prev.map((p, i) =>
                                          i === idx
                                            ? {
                                                ...p,
                                                valor_texto: fmtMoedaBrCampo(
                                                  p.valor_pago,
                                                ),
                                              }
                                            : p,
                                        ),
                                      );
                                    }}
                                    placeholder="0,00"
                                  />
                                </div>
                                <div className="form-group col-md-1 mb-0">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() =>
                                      setPagamentos((prev) =>
                                        prev.filter((_, i) => i !== idx),
                                      )
                                    }
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            ))}
                          </>
                            )}
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={salvando}
                  onClick={onClose}
                >
                  Fechar
                </button>
                {podeEditarFormulario && detalhe && !loading ? (
                  <button type="submit" className="btn btn-primary" disabled={salvando}>
                    {salvando ? "Salvando…" : "Salvar"}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      </div>
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: 1050 }}
        role="presentation"
        onClick={() => !salvando && !modalAbrirCaixaAberto && onClose()}
      />

      {modalAbrirCaixaAberto ? (
        <>
          <div
            className="modal fade show"
            style={{ display: "block", zIndex: 1070 }}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalAbrirCaixaTitleId}
          >
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title" id={modalAbrirCaixaTitleId}>
                    Abrir caixa do dia
                  </h5>
                </div>
                <div className="modal-body">
                  <p className="mb-0">
                    O caixa do dia ainda não foi aberto. Deseja abrir o caixa agora para
                    poder registrar os pagamentos?
                  </p>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => responderModalAbrirCaixa(false)}
                  >
                    Não
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => responderModalAbrirCaixa(true)}
                  >
                    Sim, abrir caixa
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div
            className="modal-backdrop fade show"
            style={{ zIndex: 1065 }}
            role="presentation"
            onClick={() => responderModalAbrirCaixa(false)}
          />
        </>
      ) : null}
    </>
  );
}
