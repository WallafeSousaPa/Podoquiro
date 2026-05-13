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

type ProdLinha = {
  id_produto: string;
  qtd: number;
  valor_desconto: number;
  desconto_texto: string;
};

function subtotalProdutosAgendamento(
  linhas: ProdLinha[],
  cat: { id: string; preco: number }[],
): number {
  let s = 0;
  for (const l of linhas) {
    const pu = cat.find((x) => x.id === l.id_produto)?.preco ?? 0;
    const bruto = Math.round(l.qtd * pu * 100) / 100;
    s += Math.max(0, Math.round((bruto - l.valor_desconto) * 100) / 100);
  }
  return Math.round(s * 100) / 100;
}

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
  produtos: {
    id: number;
    id_produto: string;
    nome_produto: string | null;
    qtd: number;
    valor_desconto: number;
    valor_produto: number;
    valor_final: number;
  }[];
  pagamentos: {
    id: number;
    id_forma_pagamento: number;
    id_maquineta: number | null;
    valor_pago: number;
    status_pagamento: string;
  }[];
  /** Pode abrir o modal do caixa e lançar pagamentos (ex.: Recepção com visão de calendário). */
  permite_editar_procedimentos_e_pagamentos: boolean;
  pagamentos_nao_carregados_por_perfil: boolean;
  /**
   * Administrador / Administrativo: editar lista de procedimentos, produtos e desconto %
   * no modal — mesmo critério do PATCH em `/api/agendamentos/[id]` para `procedimentos`.
   */
  mostrar_desconto_produtos_modal_caixa?: boolean;
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
    faltou: "badge-secondary",
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
  const [produtosLinhas, setProdutosLinhas] = useState<ProdLinha[]>([]);
  const [produtosCat, setProdutosCat] = useState<
    { id: string; produto: string; preco: number; un_medida: string; qtd_estoque: number }[]
  >([]);
  const [pagamentos, setPagamentos] = useState<PagLinha[]>([]);
  /** Desconto % do agendamento (editável no caixa para perfil admin). */
  const [descontoAgendamentoTexto, setDescontoAgendamentoTexto] = useState("");

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
      setDescontoAgendamentoTexto(String(Number(d.desconto ?? 0)));

      const [procRes, prodMercRes, fpRes, mqRes] = await Promise.all([
        fetch(
          `/api/procedimentos?id_usuario=${encodeURIComponent(String(d.id_usuario))}`,
        ),
        fetch("/api/produtos?tipo=mercadoria&status=ativo"),
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

      const prodMercJ = (await prodMercRes.json()) as {
        data?: {
          id: string;
          produto: string;
          preco: number;
          un_medida: string;
          qtd_estoque?: number;
        }[];
        error?: string;
      };
      if (!prodMercRes.ok) throw new Error(prodMercJ.error ?? "Erro ao carregar produtos.");
      setProdutosCat(
        (prodMercJ.data ?? []).map((p) => ({
          id: String(p.id),
          produto: p.produto,
          preco: Number(p.preco),
          un_medida: p.un_medida || "UN",
          qtd_estoque: Number(p.qtd_estoque ?? 0),
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
      setProdutosLinhas(
        (d.produtos ?? []).map((p) => {
          const vd = Math.max(0, Number(p.valor_desconto ?? 0));
          return {
            id_produto: String(p.id_produto),
            qtd: Number(p.qtd),
            valor_desconto: vd,
            desconto_texto: fmtMoedaBrCampo(vd),
          };
        }),
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

  function addProdLinha() {
    const primeiro = produtosCat[0];
    if (!primeiro) return;
    setProdutosLinhas((prev) => [
      ...prev,
      {
        id_produto: primeiro.id,
        qtd: 1,
        valor_desconto: 0,
        desconto_texto: fmtMoedaBrCampo(0),
      },
    ]);
  }

  function nomeProdutoCat(idProd: string) {
    return produtosCat.find((x) => x.id === idProd)?.produto ?? "Produto";
  }

  function unProdutoCat(idProd: string) {
    return produtosCat.find((x) => x.id === idProd)?.un_medida ?? "UN";
  }

  function valorFinalProdLinha(l: ProdLinha) {
    const pu = produtosCat.find((x) => x.id === l.id_produto)?.preco ?? 0;
    const bruto = Math.round(l.qtd * pu * 100) / 100;
    return Math.max(0, Math.round((bruto - l.valor_desconto) * 100) / 100);
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
      if (j.tem_fechamento && !j.tem_abertura) {
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

  const mostrarDescontoProdutosCaixa =
    detalhe?.mostrar_desconto_produtos_modal_caixa === true;

  const descontoAgendamentoNum = useMemo(() => {
    if (!detalhe) return 0;
    if (!mostrarDescontoProdutosCaixa) return Number(detalhe.desconto) || 0;
    const n = Number(String(descontoAgendamentoTexto).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) return Number(detalhe.desconto) || 0;
    return n;
  }, [detalhe, mostrarDescontoProdutosCaixa, descontoAgendamentoTexto]);

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
    if (!row || !detalhe || somenteVisualizar) return;
    if (!detalhe.permite_editar_procedimentos_e_pagamentos) return;

    const itensFaturamento = detalhe.mostrar_desconto_produtos_modal_caixa === true;

    if (itensFaturamento) {
      if (procedimentos.length === 0) {
        setErro("Informe ao menos um procedimento.");
        return;
      }

      for (const l of produtosLinhas) {
        if (!Number.isFinite(l.qtd) || l.qtd <= 0) {
          setErro("Informe quantidade válida para todos os produtos.");
          return;
        }
      }

      const vbProc =
        Math.round(procedimentos.reduce((s, p) => s + p.valor_aplicado, 0) * 100) /
        100;
      const vbProd = subtotalProdutosAgendamento(produtosLinhas, produtosCat);
      const vb = Math.round((vbProc + vbProd) * 100) / 100;
      const totalEsperado = calcularValorTotal(vb, descontoAgendamentoNum);
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
            `A soma dos pagamentos (${fmtBrl(somaPg)}) deve ser igual ao total do agendamento (${fmtBrl(totalEsperado)}): soma dos procedimentos e produtos${
              mostrarDescontoProdutosCaixa && descontoAgendamentoNum > 0
                ? ` com ${descontoAgendamentoNum}% de desconto`
                : ""
            }. Ajuste os valores antes de salvar.`,
          );
          return;
        }
        const caixaOk = await garantirCaixaHabilitadoParaPagamento();
        if (!caixaOk) return;
      }

      setSalvando(true);
      setErro(null);
      try {
        const body: Record<string, unknown> = {
          procedimentos,
          produtos: produtosLinhas.map((l) => ({
            id_produto: l.id_produto,
            qtd: l.qtd,
            valor_desconto: Math.max(0, l.valor_desconto),
          })),
        };
        if (mostrarDescontoProdutosCaixa) {
          body.desconto = descontoAgendamentoNum;
        }
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
      return;
    }

    /* Recepção etc.: só altera pagamentos; não enviar `procedimentos` (API exige admin). */
    if (detalhe.status !== "realizado" || detalhe.pagamentos_nao_carregados_por_perfil) {
      setErro("Não há alterações permitidas para salvar com seu perfil neste agendamento.");
      return;
    }

    const somaPg =
      Math.round(
        pagamentos.reduce(
          (s, p) => s + (Number.isFinite(p.valor_pago) ? p.valor_pago : 0),
          0,
        ) * 100,
      ) / 100;
    const brutoAg =
      Math.round(
        (Math.round(
          procedimentos.reduce((s, p) => s + p.valor_aplicado, 0) * 100,
        ) /
          100 +
          subtotalProdutosAgendamento(produtosLinhas, produtosCat)) *
          100,
      ) / 100;
    const totalEsperado = calcularValorTotal(brutoAg, descontoAgendamentoNum);
    if (Math.abs(somaPg - totalEsperado) > 0.02) {
      setErro(
        `A soma dos pagamentos (${fmtBrl(somaPg)}) deve ser igual ao total do agendamento (${fmtBrl(totalEsperado)}). Ajuste os valores antes de salvar.`,
      );
      return;
    }
    const caixaOk = await garantirCaixaHabilitadoParaPagamento();
    if (!caixaOk) return;

    setSalvando(true);
    setErro(null);
    try {
      const body = {
        pagamentos: pagamentos.map(
          ({ id_forma_pagamento, id_maquineta, valor_pago }) => ({
            id_forma_pagamento,
            id_maquineta,
            valor_pago,
            status_pagamento: "pago" as const,
          }),
        ),
      };
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

  const podeAcessarCaixaAgendamento =
    detalhe?.permite_editar_procedimentos_e_pagamentos === true;
  /** Alinhado ao PATCH: só Administrador/Administrativo alteram lista de procedimentos/produtos. */
  const podeEditarItensFaturamentoCaixa =
    detalhe?.mostrar_desconto_produtos_modal_caixa === true;
  const pagamentosOcultos = detalhe?.pagamentos_nao_carregados_por_perfil === true;
  const somenteLeitura = !podeAcessarCaixaAgendamento || somenteVisualizar;
  const podeEditarFormularioBase = podeAcessarCaixaAgendamento && !somenteVisualizar;
  const agendamentoConcluido = detalhe?.status === "realizado";
  const podeEditarPagamentos =
    podeEditarFormularioBase && agendamentoConcluido && !pagamentosOcultos;
  const podeSalvarNoModal =
    podeEditarFormularioBase &&
    (podeEditarItensFaturamentoCaixa ||
      (agendamentoConcluido && !pagamentosOcultos));

  const somaProcedimentos = useMemo(
    () =>
      Math.round(
        procedimentos.reduce((s, p) => s + p.valor_aplicado, 0) * 100,
      ) / 100,
    [procedimentos],
  );

  const somaProdutos = useMemo(
    () => subtotalProdutosAgendamento(produtosLinhas, produtosCat),
    [produtosLinhas, produtosCat],
  );

  const somaBrutaAgendamento = useMemo(
    () => Math.round((somaProcedimentos + somaProdutos) * 100) / 100,
    [somaProcedimentos, somaProdutos],
  );

  const totalEsperadoRecebimento = useMemo(() => {
    if (!detalhe) return 0;
    return calcularValorTotal(somaBrutaAgendamento, descontoAgendamentoNum);
  }, [detalhe, somaBrutaAgendamento, descontoAgendamentoNum]);

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

  const produtosLinhasComEstoqueZerado = useMemo(() => {
    const ids = new Set(produtosLinhas.map((l) => l.id_produto));
    return produtosCat.filter((c) => ids.has(c.id) && c.qtd_estoque <= 0);
  }, [produtosLinhas, produtosCat]);

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
                if (!podeEditarFormularioBase) return;
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

                    {podeAcessarCaixaAgendamento && somenteVisualizar ? (
                      <div className="alert alert-info py-2 small mb-3" role="status">
                        Todos os pagamentos deste agendamento estão quitados. Você pode
                        apenas visualizar os dados.
                      </div>
                    ) : null}

                    {!podeAcessarCaixaAgendamento ? (
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

                    {podeEditarFormularioBase &&
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
                        <strong className="d-block mb-2">Produtos</strong>
                        <ul className="small mb-3">
                          {(detalhe.produtos ?? []).length === 0 ? (
                            <li className="text-muted">—</li>
                          ) : (
                            (detalhe.produtos ?? []).map((p) => (
                              <li key={p.id}>
                                {p.nome_produto ?? "Produto"} · {p.qtd}{" "}
                                {unProdutoCat(String(p.id_produto))} ×{" "}
                                {fmtBrl(Number(p.valor_produto))}
                                {mostrarDescontoProdutosCaixa &&
                                Number(p.valor_desconto) > 0
                                  ? ` · desc. ${fmtBrl(Number(p.valor_desconto))}`
                                  : ""}{" "}
                                → {fmtBrl(Number(p.valor_final))}
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

                    {podeEditarFormularioBase ? (
                      <>
                        {podeEditarItensFaturamentoCaixa ? (
                          <>
                        <hr />
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <strong>Procedimentos</strong>
                          {mostrarDescontoProdutosCaixa ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={addProcLinha}
                              disabled={procedimentosCat.length === 0}
                            >
                              + Procedimento
                            </button>
                          ) : null}
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

                        <hr />
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <strong>Produtos (mercadorias)</strong>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={addProdLinha}
                            disabled={produtosCat.length === 0}
                          >
                            + Produto
                          </button>
                        </div>
                        {produtosCat.length === 0 ? (
                          <p className="small text-muted mb-0">
                            Nenhuma mercadoria ativa no cadastro de produtos.
                          </p>
                        ) : produtosLinhas.length === 0 ? (
                          <p className="small text-muted mb-0">
                            Nenhum produto neste agendamento. Use &quot;+ Produto&quot; para
                            incluir.
                          </p>
                        ) : (
                          <>
                          {produtosLinhasComEstoqueZerado.length > 0 ? (
                            <div className="alert alert-warning py-2 small mb-2" role="status">
                              <strong>Estoque zerado:</strong>{" "}
                              {produtosLinhasComEstoqueZerado
                                .map((p) => p.produto)
                                .join(", ")}
                              . Você pode concluir a venda mesmo assim; o estoque será
                              atualizado e poderá ficar negativo.
                            </div>
                          ) : null}
                          {produtosLinhas.map((linha, idx) => (
                            <div key={idx} className="form-row align-items-end mb-2">
                              <div
                                className={`form-group mb-0 ${
                                  mostrarDescontoProdutosCaixa
                                    ? "col-md-4"
                                    : "col-md-5"
                                }`}
                              >
                                <label className="small">Produto</label>
                                <select
                                  className="form-control form-control-sm"
                                  value={linha.id_produto || ""}
                                  onChange={(e) => {
                                    const id = e.target.value;
                                    setProdutosLinhas((prev) =>
                                      prev.map((p, i) =>
                                        i === idx ? { ...p, id_produto: id } : p,
                                      ),
                                    );
                                  }}
                                >
                                  {!produtosCat.some((c) => c.id === linha.id_produto) &&
                                  linha.id_produto ? (
                                    <option value={linha.id_produto}>
                                      (fora do catálogo) {linha.id_produto}
                                    </option>
                                  ) : null}
                                  {produtosCat.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.produto} — {fmtBrl(p.preco)}/{p.un_medida}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="form-group col-md-2 mb-0">
                                <label className="small">Qtd ({unProdutoCat(linha.id_produto)})</label>
                                <input
                                  type="number"
                                  min={0.01}
                                  step="any"
                                  className="form-control form-control-sm"
                                  value={Number.isFinite(linha.qtd) ? linha.qtd : ""}
                                  onChange={(e) => {
                                    const n = Number(e.target.value);
                                    setProdutosLinhas((prev) =>
                                      prev.map((p, i) =>
                                        i === idx
                                          ? {
                                              ...p,
                                              qtd: Number.isFinite(n) && n > 0 ? n : p.qtd,
                                            }
                                          : p,
                                      ),
                                    );
                                  }}
                                />
                              </div>
                              {mostrarDescontoProdutosCaixa ? (
                              <div className="form-group col-md-2 mb-0">
                                <label className="small">Desc. (R$)</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  className="form-control form-control-sm"
                                  value={linha.desconto_texto}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const n = parseMoedaBrCliente(raw);
                                    setProdutosLinhas((prev) =>
                                      prev.map((p, i) =>
                                        i === idx
                                          ? {
                                              ...p,
                                              desconto_texto: raw,
                                              valor_desconto: Number.isNaN(n)
                                                ? p.valor_desconto
                                                : Math.max(0, n),
                                            }
                                          : p,
                                      ),
                                    );
                                  }}
                                  onBlur={() => {
                                    setProdutosLinhas((prev) =>
                                      prev.map((p, i) =>
                                        i === idx
                                          ? {
                                              ...p,
                                              desconto_texto: fmtMoedaBrCampo(
                                                p.valor_desconto,
                                              ),
                                            }
                                          : p,
                                      ),
                                    );
                                  }}
                                />
                              </div>
                              ) : null}
                              <div
                                className={`form-group mb-0 ${
                                  mostrarDescontoProdutosCaixa
                                    ? "col-md-2"
                                    : "col-md-3"
                                }`}
                              >
                                <label className="small">Subtotal</label>
                                <input
                                  type="text"
                                  readOnly
                                  className="form-control form-control-sm bg-light"
                                  value={valorFinalProdLinha(linha).toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                />
                              </div>
                              <div
                                className={`form-group mb-0 ${
                                  mostrarDescontoProdutosCaixa
                                    ? "col-md-1"
                                    : "col-md-2"
                                }`}
                              >
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() =>
                                    setProdutosLinhas((prev) =>
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
                        ) : (
                          <>
                            <hr />
                            <div
                              className="alert alert-light border small mb-3"
                              role="status"
                            >
                              <strong>Leitura:</strong> procedimentos e mercadorias só
                              podem ser alterados por perfil{" "}
                              <strong>Administrador</strong> ou{" "}
                              <strong>Administrativo</strong>. Com seu perfil você pode
                              registrar ou ajustar apenas os{" "}
                              <strong>pagamentos</strong> quando o status for{" "}
                              <strong>Realizado</strong>.
                            </div>
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
                            <strong className="d-block mb-2">Produtos</strong>
                            <ul className="small mb-3">
                              {(detalhe.produtos ?? []).length === 0 ? (
                                <li className="text-muted">—</li>
                              ) : (
                                (detalhe.produtos ?? []).map((p) => (
                                  <li key={p.id}>
                                    {p.nome_produto ?? "Produto"} · {p.qtd}{" "}
                                    {unProdutoCat(String(p.id_produto))} ×{" "}
                                    {fmtBrl(Number(p.valor_produto))}
                                    {mostrarDescontoProdutosCaixa &&
                                    Number(p.valor_desconto) > 0
                                      ? ` · desc. ${fmtBrl(Number(p.valor_desconto))}`
                                      : ""}{" "}
                                    → {fmtBrl(Number(p.valor_final))}
                                  </li>
                                ))
                              )}
                            </ul>
                          </>
                        )}

                        {podeEditarFormularioBase && !pagamentosOcultos && !agendamentoConcluido ? (
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
                                <span className="d-block w-100">
                                  <strong>Procedimentos (bruto):</strong>{" "}
                                  {fmtBrl(somaProcedimentos)}
                                  {" · "}
                                  <strong>Produtos:</strong> {fmtBrl(somaProdutos)}
                                  {" · "}
                                  <strong>Bruto do agendamento:</strong>{" "}
                                  {fmtBrl(somaBrutaAgendamento)}
                                </span>
                                {mostrarDescontoProdutosCaixa ? (
                                  <>
                                    <div className="w-100 mt-1">
                                      <label
                                        className="small font-weight-bold d-block mb-1"
                                        htmlFor="caixa-modal-desconto-agendamento"
                                      >
                                        Desconto do agendamento (%)
                                      </label>
                                      <input
                                        id="caixa-modal-desconto-agendamento"
                                        type="text"
                                        className="form-control form-control-sm d-inline-block"
                                        style={{ maxWidth: "7.5rem" }}
                                        inputMode="decimal"
                                        autoComplete="off"
                                        value={descontoAgendamentoTexto}
                                        onChange={(e) =>
                                          setDescontoAgendamentoTexto(e.target.value)
                                        }
                                        title="Entre 0 e 100. Salve o formulário para aplicar."
                                      />
                                      <small className="form-text text-muted d-block">
                                        O total a receber considera este percentual sobre o
                                        bruto (procedimentos + produtos).
                                      </small>
                                    </div>
                                    <span className="text-muted d-block w-100 mt-1">
                                      <strong>Total a receber:</strong>{" "}
                                      {fmtBrl(totalEsperadoRecebimento)}
                                    </span>
                                  </>
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
                {podeSalvarNoModal && detalhe && !loading ? (
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
