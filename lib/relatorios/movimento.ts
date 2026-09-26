import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TIPO_ENTRADA_ATENDIMENTO,
  TIPO_ENTRADA_TAXA_AGENDAMENTO,
} from "@/lib/financeiro/caixa-movimento";
import { nomeExibicaoPaciente } from "@/lib/pacientes";
import { dayStartIsoBr, nextDayStartIsoBr } from "@/lib/relatorios/periodo";

export type BucketMovimento =
  | "dinheiro"
  | "link_pagamento"
  | "cartao_credito"
  | "cartao_debito"
  | "pix"
  | "outros";

export type LancamentoRelatorioMovimento = {
  id: number;
  dia: string;
  data_movimentacao: string;
  atendimento_id: number | null;
  data_hora_atendimento: string | null;
  paciente: string;
  profissional: string;
  tipo_entrada: string;
  tipo_label: string;
  descricao: string;
  valor: number;
};

export type LinhaRelatorioMovimento = {
  chave: string;
  forma: string;
  maquineta: string | null;
  quantidade: number;
  total: number;
  lancamentos: LancamentoRelatorioMovimento[];
};

export type RelatorioMovimentoData = {
  periodo: { data_inicio: string; data_fim: string; dias: number };
  agrupado: true;
  quantidade: number;
  total: number;
  linhas: LinhaRelatorioMovimento[];
};

const PAGE = 1000;
const SEM_MAQUINETA = "Sem maquineta";

const LABELS: Record<BucketMovimento, string> = {
  dinheiro: "Dinheiro",
  link_pagamento: "Link de pagamento",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  pix: "PIX",
  outros: "Outras formas",
};

const ORDEM_FORMA: Record<BucketMovimento, number> = {
  dinheiro: 1,
  link_pagamento: 2,
  cartao_credito: 3,
  cartao_debito: 4,
  pix: 5,
  outros: 6,
};

function arredondarMoeda(v: number): number {
  return Math.round(v * 100) / 100;
}

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function diasInclusivos(inicio: string, fim: string): number {
  const a = Date.parse(`${inicio}T00:00:00`);
  const b = Date.parse(`${fim}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function ehDinheiroNome(nome: string): boolean {
  return (
    nome.includes("dinheiro") ||
    nome.includes("espécie") ||
    nome.includes("especie") ||
    nome.includes("numerário") ||
    nome.includes("numerario")
  );
}

function ehDebitoNome(nome: string): boolean {
  return nome.includes("débito") || nome.includes("debito");
}

function ehCreditoNome(nome: string): boolean {
  return (
    nome.includes("crédito") ||
    nome.includes("credito") ||
    nome.includes("cart") ||
    nome.includes("cartão") ||
    nome.includes("cartao")
  );
}

export function classificarBucketMovimento(args: {
  tipoEntrada: string;
  agrupamento: string | null | undefined;
  nomeForma: string | null | undefined;
}): BucketMovimento {
  const tipo = args.tipoEntrada.trim().toLowerCase();
  const ag = (args.agrupamento ?? "").trim().toLowerCase();
  const nome = (args.nomeForma ?? "").trim().toLowerCase();

  if (tipo === TIPO_ENTRADA_TAXA_AGENDAMENTO) {
    if (ag === "dinheiro" || ehDinheiroNome(nome)) return "dinheiro";
    return "link_pagamento";
  }

  if (ag === "dinheiro") return "dinheiro";
  if (ag === "pix") return "pix";
  if (ag === "link_pagamento") return "link_pagamento";
  if (ag === "cartao_credito") return "cartao_credito";
  if (ag === "cartao_debito") return "cartao_debito";
  if (ag === "outros") return "outros";

  if (nome.includes("link")) return "link_pagamento";
  if (nome.includes("pix")) return "pix";
  if (ehDinheiroNome(nome)) return "dinheiro";
  if (ehDebitoNome(nome)) return "cartao_debito";
  if (ehCreditoNome(nome)) return "cartao_credito";
  return "outros";
}

type CaixaMovRow = {
  id: number;
  tipo_entrada: string | null;
  forma_pagamento: string | null;
  valor: number | string | null;
  id_pagamento: number | null;
  id_taxa_rede: number | null;
  data_movimentacao: string | null;
  descricao: string | null;
  atendimento_id: number | null;
};

type FormaEmbed = { nome?: string | null; agrupamento_caixa?: string | null };
type MaquinetaEmbed = { nome?: string | null };
type PacienteEmbed = { nome_completo?: string | null; nome_social?: string | null };
type UsuarioEmbed = { nome_completo?: string | null; usuario?: string | null };

type PagamentoRow = {
  id: number;
  id_maquineta?: number | null;
  formas_pagamento?: FormaEmbed | FormaEmbed[] | null;
  maquinetas?: MaquinetaEmbed | MaquinetaEmbed[] | null;
};

type TaxaRow = {
  id: number;
  pago_em_dinheiro?: boolean | null;
  asaas_payment_id?: string | null;
  asaas_payment_link_id?: string | null;
  rede_tid?: string | null;
  rede_payment_link_id?: string | null;
};

type AgendamentoRow = {
  id: number;
  data_hora_inicio?: string | null;
  pacientes?: PacienteEmbed | PacienteEmbed[] | null;
  usuarios?: UsuarioEmbed | UsuarioEmbed[] | null;
};

function origemMaquinetaTaxa(t: TaxaRow | undefined): string | null {
  if (!t || t.pago_em_dinheiro) return null;
  const asaas =
    Boolean(t.asaas_payment_id?.trim()) || Boolean(t.asaas_payment_link_id?.trim());
  const rede = Boolean(t.rede_tid?.trim()) || Boolean(t.rede_payment_link_id?.trim());
  if (asaas) return "Asaas";
  if (rede) return "REDE";
  return "Link de pagamento";
}

function bucketUsaMaquineta(bucket: BucketMovimento): boolean {
  return (
    bucket === "pix" ||
    bucket === "link_pagamento" ||
    bucket === "cartao_credito" ||
    bucket === "cartao_debito"
  );
}

function ymdBrFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function rotuloTipoEntrada(tipo: string): string {
  if (tipo === TIPO_ENTRADA_TAXA_AGENDAMENTO) return "Taxa / Link";
  if (tipo === TIPO_ENTRADA_ATENDIMENTO) return "Atendimento";
  return tipo || "—";
}

function nomeProfissional(u: UsuarioEmbed | null): string {
  if (!u) return "—";
  return u.nome_completo?.trim() || u.usuario?.trim() || "—";
}

async function fetchAllMovimentos(
  supabase: SupabaseClient,
  idEmpresa: number,
  dataInicio: string,
  dataFim: string,
): Promise<CaixaMovRow[]> {
  const out: CaixaMovRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("caixa_movimento")
      .select(
        "id, tipo_entrada, forma_pagamento, valor, id_pagamento, id_taxa_rede, data_movimentacao, descricao, atendimento_id",
      )
      .eq("id_empresa", idEmpresa)
      .in("tipo_entrada", [TIPO_ENTRADA_ATENDIMENTO, TIPO_ENTRADA_TAXA_AGENDAMENTO])
      .gte("data_movimentacao", dayStartIsoBr(dataInicio))
      .lt("data_movimentacao", nextDayStartIsoBr(dataFim))
      .gt("valor", 0)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as CaixaMovRow[];
    out.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function fetchPagamentosPorIds(
  supabase: SupabaseClient,
  ids: number[],
): Promise<Map<number, PagamentoRow>> {
  const map = new Map<number, PagamentoRow>();
  if (ids.length === 0) return map;
  for (let i = 0; i < ids.length; i += PAGE) {
    const slice = ids.slice(i, i + PAGE);
    const { data, error } = await supabase
      .from("pagamentos")
      .select("id, id_maquineta, formas_pagamento(nome, agrupamento_caixa), maquinetas(nome)")
      .in("id", slice);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as PagamentoRow[]) {
      map.set(row.id, row);
    }
  }
  return map;
}

async function fetchTaxasPorIds(
  supabase: SupabaseClient,
  ids: number[],
): Promise<Map<number, TaxaRow>> {
  const map = new Map<number, TaxaRow>();
  if (ids.length === 0) return map;
  for (let i = 0; i < ids.length; i += PAGE) {
    const slice = ids.slice(i, i + PAGE);
    const { data, error } = await supabase
      .from("agendamento_taxa_rede")
      .select(
        "id, pago_em_dinheiro, asaas_payment_id, asaas_payment_link_id, rede_tid, rede_payment_link_id",
      )
      .in("id", slice);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as TaxaRow[]) {
      map.set(row.id, row);
    }
  }
  return map;
}

async function fetchAgendamentosPorIds(
  supabase: SupabaseClient,
  ids: number[],
): Promise<Map<number, AgendamentoRow>> {
  const map = new Map<number, AgendamentoRow>();
  if (ids.length === 0) return map;
  for (let i = 0; i < ids.length; i += PAGE) {
    const slice = ids.slice(i, i + PAGE);
    const { data, error } = await supabase
      .from("agendamentos")
      .select(
        "id, data_hora_inicio, pacientes ( nome_completo, nome_social ), usuarios ( nome_completo, usuario )",
      )
      .in("id", slice);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as AgendamentoRow[]) {
      map.set(row.id, row);
    }
  }
  return map;
}

function chaveLinha(bucket: BucketMovimento, detalhe: string | null): string {
  return `${bucket}|${(detalhe ?? "").toLowerCase()}`;
}

export async function gerarRelatorioMovimento(
  supabase: SupabaseClient,
  args: { idEmpresa: number; dataInicio: string; dataFim: string },
): Promise<RelatorioMovimentoData> {
  const movimentos = await fetchAllMovimentos(
    supabase,
    args.idEmpresa,
    args.dataInicio,
    args.dataFim,
  );

  const idsPagamento = [
    ...new Set(
      movimentos
        .map((m) => m.id_pagamento)
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  ];
  const idsTaxa = [
    ...new Set(
      movimentos
        .map((m) => m.id_taxa_rede)
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  ];
  const idsAgendamento = [
    ...new Set(
      movimentos
        .map((m) => m.atendimento_id)
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  ];
  const [pagamentos, taxas, agendamentos] = await Promise.all([
    fetchPagamentosPorIds(supabase, idsPagamento),
    fetchTaxasPorIds(supabase, idsTaxa),
    fetchAgendamentosPorIds(supabase, idsAgendamento),
  ]);

  const acc = new Map<string, LinhaRelatorioMovimento>();
  let quantidade = 0;
  let total = 0;

  for (const mov of movimentos) {
    const valor = arredondarMoeda(Number(mov.valor));
    if (!Number.isFinite(valor) || valor <= 0) continue;

    const pag = mov.id_pagamento != null ? pagamentos.get(mov.id_pagamento) : undefined;
    const taxa = mov.id_taxa_rede != null ? taxas.get(mov.id_taxa_rede) : undefined;
    const ag =
      mov.atendimento_id != null ? agendamentos.get(mov.atendimento_id) : undefined;
    const forma = one(pag?.formas_pagamento);
    const maq = one(pag?.maquinetas);
    const nomeForma =
      (forma?.nome ?? "").trim() ||
      (mov.forma_pagamento ?? "").trim() ||
      "—";
    const agrupamento = forma?.agrupamento_caixa ?? null;

    const bucket = classificarBucketMovimento({
      tipoEntrada: String(mov.tipo_entrada ?? ""),
      agrupamento,
      nomeForma,
    });

    quantidade += 1;
    total = arredondarMoeda(total + valor);

    const nomeMaquinetaCadastro = (maq?.nome ?? "").trim();
    const origemLink = origemMaquinetaTaxa(taxa);
    let maquineta: string | null = null;
    if (bucketUsaMaquineta(bucket)) {
      maquineta = nomeMaquinetaCadastro || origemLink || SEM_MAQUINETA;
    }
    const detalheOutros = bucket === "outros" ? nomeForma : null;
    const chave = chaveLinha(bucket, maquineta ?? detalheOutros);

    const pac = one(ag?.pacientes);
    const dataMov = mov.data_movimentacao?.trim() || "";
    const tipo = String(mov.tipo_entrada ?? "");
    const lancamento: LancamentoRelatorioMovimento = {
      id: mov.id,
      dia: dataMov ? ymdBrFromIso(dataMov) : "",
      data_movimentacao: dataMov,
      atendimento_id: mov.atendimento_id,
      data_hora_atendimento: ag?.data_hora_inicio ?? null,
      paciente: pac
        ? nomeExibicaoPaciente({
            nome_completo: pac.nome_completo ?? null,
            nome_social: pac.nome_social ?? null,
          }) || "—"
        : "—",
      profissional: nomeProfissional(one(ag?.usuarios)),
      tipo_entrada: tipo,
      tipo_label: rotuloTipoEntrada(tipo),
      descricao: (mov.descricao ?? "").trim() || "—",
      valor,
    };

    const atual = acc.get(chave);
    if (atual) {
      atual.quantidade += 1;
      atual.total = arredondarMoeda(atual.total + valor);
      atual.lancamentos.push(lancamento);
      continue;
    }
    acc.set(chave, {
      chave,
      forma: bucket === "outros" ? nomeForma : LABELS[bucket],
      maquineta,
      quantidade: 1,
      total: valor,
      lancamentos: [lancamento],
    });
  }

  const ordemBucket = (forma: string): number => {
    const found = (Object.entries(LABELS) as [BucketMovimento, string][]).find(
      ([, label]) => label === forma,
    );
    if (found) return ORDEM_FORMA[found[0]];
    return ORDEM_FORMA.outros;
  };

  const linhas = [...acc.values()].sort((a, b) => {
    const oa = ordemBucket(a.forma);
    const ob = ordemBucket(b.forma);
    if (oa !== ob) return oa - ob;
    const ma = a.maquineta ?? "";
    const mb = b.maquineta ?? "";
    if (ma !== mb) return ma.localeCompare(mb, "pt-BR");
    return a.forma.localeCompare(b.forma, "pt-BR");
  });

  for (const linha of linhas) {
    linha.lancamentos.sort((a, b) => {
      if (a.data_movimentacao !== b.data_movimentacao) {
        return a.data_movimentacao < b.data_movimentacao ? 1 : -1;
      }
      return b.id - a.id;
    });
  }

  return {
    periodo: {
      data_inicio: args.dataInicio,
      data_fim: args.dataFim,
      dias: diasInclusivos(args.dataInicio, args.dataFim),
    },
    agrupado: true,
    quantidade,
    total,
    linhas,
  };
}
