import type { SupabaseClient } from "@supabase/supabase-js";
import {
  labelFormaPagamentoFromAsaasBillingType,
  labelFormaPagamentoTaxaAsaas,
} from "@/lib/financeiro/taxa-forma-pagamento";

export const TIPO_ENTRADA_ATENDIMENTO = "atendimento";
export const TIPO_ENTRADA_CAIXA_RELATORIO = "caixa_relatorio";
export const TIPO_ENTRADA_TAXA_AGENDAMENTO = "taxa_agendamento";
export const TIPO_ENTRADA_FUNDO_CAIXA = "fundo_caixa";

export type PagamentoInseridoCaixa = {
  id: number;
  id_forma_pagamento: number;
  valor_pago: number;
  status_pagamento: string;
};

type TaxaRedeRow = {
  id: number;
  id_agendamento: number;
  id_empresa: number;
  valor: number;
  status: string;
  pago_em: string | null;
  pago_em_dinheiro: boolean | null;
  rede_tid: string | null;
  rede_payment_link_id: string | null;
  asaas_payment_link_id: string | null;
  asaas_resposta: unknown;
  agendamentos:
    | { id_paciente: number }
    | { id_paciente: number }[]
    | null;
};

function arredondarMoeda(v: number): number {
  return Math.round(v * 100) / 100;
}

async function nomeFormaPagamentoDinheiro(
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabase
    .from("formas_pagamento")
    .select("nome, agrupamento_caixa")
    .eq("ativo", true);
  if (error) throw new Error(error.message);
  const porAgrupamento = (data ?? []).find((f) => f.agrupamento_caixa === "dinheiro");
  if (porAgrupamento?.nome) return String(porAgrupamento.nome).trim();
  const porNome = (data ?? []).find((f) => {
    const n = String(f.nome ?? "").toLowerCase();
    return n.includes("dinheiro") || n.includes("espécie") || n.includes("especie");
  });
  return porNome?.nome ? String(porNome.nome).trim() : "Dinheiro";
}

async function inferirFormaPagamentoTaxa(
  supabase: SupabaseClient,
  taxa: TaxaRedeRow,
): Promise<string> {
  if (taxa.pago_em_dinheiro) {
    return nomeFormaPagamentoDinheiro(supabase);
  }
  if (
    (taxa.rede_tid && taxa.rede_tid.trim()) ||
    (taxa.rede_payment_link_id && taxa.rede_payment_link_id.trim())
  ) {
    return "PIX";
  }
  if (taxa.asaas_payment_link_id?.trim()) {
    const labelAsaas = labelFormaPagamentoTaxaAsaas(taxa.asaas_resposta);
    if (labelAsaas) return labelAsaas;
    return "Link pagamento";
  }
  return "Taxa agendamento";
}

async function somarTaxaJaContabilizada(
  supabase: SupabaseClient,
  idAgendamento: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("caixa_movimento")
    .select("valor")
    .eq("atendimento_id", idAgendamento)
    .eq("tipo_entrada", TIPO_ENTRADA_TAXA_AGENDAMENTO);
  if (error) throw new Error(error.message);
  return arredondarMoeda((data ?? []).reduce((s, r) => s + Number(r.valor), 0));
}

/** Ignora pagamentos que repetem taxa já lançada em caixa_movimento (ex.: taxa em dinheiro na confirmação). */
export function filtrarPagamentosNaoContabilizadosComoTaxa(
  quitados: PagamentoInseridoCaixa[],
  valorTaxaJaContabilizada: number,
): PagamentoInseridoCaixa[] {
  if (valorTaxaJaContabilizada <= 0) return quitados;
  let aIgnorar = valorTaxaJaContabilizada;
  const resultado: PagamentoInseridoCaixa[] = [];
  for (const p of quitados) {
    const v = arredondarMoeda(Number(p.valor_pago));
    if (aIgnorar > 0.01 && v <= aIgnorar + 0.02) {
      aIgnorar = arredondarMoeda(aIgnorar - v);
      continue;
    }
    resultado.push(p);
  }
  return resultado;
}

const FORMAS_TAXA_GENERICAS = new Set([
  "Link pagamento",
  "Taxa agendamento",
  "—",
]);

async function atualizarFormaCaixaMovimentoTaxa(
  supabase: SupabaseClient,
  idTaxaRede: number,
  formaPagamento: string,
): Promise<void> {
  const forma = formaPagamento.trim();
  if (!forma || FORMAS_TAXA_GENERICAS.has(forma)) return;

  const { data: mov, error: mErr } = await supabase
    .from("caixa_movimento")
    .select("id, forma_pagamento")
    .eq("id_taxa_rede", idTaxaRede)
    .maybeSingle();
  if (mErr) throw new Error(mErr.message);
  if (!mov) return;

  const atual = String(mov.forma_pagamento ?? "").trim();
  if (atual === forma || (!FORMAS_TAXA_GENERICAS.has(atual) && atual !== "")) {
    return;
  }

  const { error: upErr } = await supabase
    .from("caixa_movimento")
    .update({ forma_pagamento: forma })
    .eq("id", mov.id as number);
  if (upErr) throw new Error(upErr.message);
}
export async function removerCaixaMovimentoAtendimento(
  supabase: SupabaseClient,
  idAgendamento: number,
): Promise<void> {
  const { error } = await supabase
    .from("caixa_movimento")
    .delete()
    .eq("atendimento_id", idAgendamento)
    .eq("tipo_entrada", TIPO_ENTRADA_ATENDIMENTO);
  if (error) throw new Error(error.message);
}

/**
 * Registra entrada de taxa de agendamento quitada (dinheiro, PIX, link).
 * Idempotente por id_taxa_rede.
 */
export async function registrarCaixaMovimentoTaxaSePago(
  supabase: SupabaseClient,
  idTaxaRede: number,
  opts?: { idPagamento?: number | null; formaPagamento?: string },
): Promise<boolean> {
  const { data: existente, error: exErr } = await supabase
    .from("caixa_movimento")
    .select("id")
    .eq("id_taxa_rede", idTaxaRede)
    .maybeSingle();
  if (exErr) throw new Error(exErr.message);

  const { data: taxa, error: tErr } = await supabase
    .from("agendamento_taxa_rede")
    .select(
      `
      id,
      id_agendamento,
      id_empresa,
      valor,
      status,
      pago_em,
      pago_em_dinheiro,
      rede_tid,
      rede_payment_link_id,
      asaas_payment_link_id,
      asaas_resposta,
      agendamentos ( id_paciente )
    `,
    )
    .eq("id", idTaxaRede)
    .maybeSingle();

  if (tErr) throw new Error(tErr.message);
  if (!taxa || taxa.status !== "pago") return false;

  const row = taxa as TaxaRedeRow;
  const formaPagamento =
    opts?.formaPagamento?.trim() ||
    (await inferirFormaPagamentoTaxa(supabase, row));

  if (existente) {
    await atualizarFormaCaixaMovimentoTaxa(supabase, idTaxaRede, formaPagamento);
    return false;
  }

  const valor = arredondarMoeda(Number(row.valor));
  if (valor <= 0) return false;

  const agRaw = row.agendamentos;
  const ag = Array.isArray(agRaw) ? agRaw[0] : agRaw;
  const idPaciente = ag?.id_paciente as number | undefined;

  const descricao = idPaciente
    ? await montarDescricaoMovimentoTaxaAgendamento(
        supabase,
        row.id_agendamento,
        idPaciente,
      )
    : `Taxa agendamento — atendimento #${row.id_agendamento}`;

  let idPagamento = opts?.idPagamento ?? null;
  if (idPagamento == null && row.pago_em_dinheiro) {
    const { data: pg } = await supabase
      .from("pagamentos")
      .select("id")
      .eq("id_agendamento", row.id_agendamento)
      .eq("status_pagamento", "pago")
      .eq("valor_pago", valor)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    idPagamento = pg?.id as number | null;
  }

  const { error: insErr } = await supabase.from("caixa_movimento").insert({
    id_empresa: row.id_empresa,
    data_movimentacao: row.pago_em ?? new Date().toISOString(),
    data_vencimento: null,
    descricao,
    tipo_entrada: TIPO_ENTRADA_TAXA_AGENDAMENTO,
    forma_pagamento: formaPagamento,
    parcela: null,
    valor,
    atendimento_id: row.id_agendamento,
    id_pagamento: idPagamento,
    id_taxa_rede: idTaxaRede,
  });
  if (insErr) throw new Error(insErr.message);
  return true;
}

/**
 * Registra entradas no caixa a partir dos pagamentos quitados do atendimento.
 * Deve ser chamado após remover movimentos antigos e inserir os pagamentos.
 */
export async function registrarCaixaMovimentoPagamentosAgendamento(
  supabase: SupabaseClient,
  args: {
    idEmpresa: number;
    idAgendamento: number;
    descricaoAtendimento?: string | null;
    pagamentos: PagamentoInseridoCaixa[];
  },
): Promise<void> {
  const quitadosBrutos = args.pagamentos.filter(
    (p) => p.status_pagamento === "pago" && Number(p.valor_pago) > 0,
  );
  if (quitadosBrutos.length === 0) return;

  const taxaJaContabilizada = await somarTaxaJaContabilizada(
    supabase,
    args.idAgendamento,
  );
  const quitados = filtrarPagamentosNaoContabilizadosComoTaxa(
    quitadosBrutos,
    taxaJaContabilizada,
  );
  if (quitados.length === 0) return;

  const idsFormas = [...new Set(quitados.map((p) => p.id_forma_pagamento))];
  const { data: formas, error: fErr } = await supabase
    .from("formas_pagamento")
    .select("id, nome")
    .in("id", idsFormas);
  if (fErr) throw new Error(fErr.message);

  const nomeForma = new Map<number, string>();
  for (const f of formas ?? []) {
    nomeForma.set(f.id as number, String(f.nome ?? "—").trim() || "—");
  }

  const descricaoBase =
    args.descricaoAtendimento?.trim() ||
    `Pagamento do atendimento #${args.idAgendamento}`;
  const agora = new Date().toISOString();

  const rows = quitados.map((p) => ({
    id_empresa: args.idEmpresa,
    data_movimentacao: agora,
    data_vencimento: null,
    descricao: descricaoBase,
    tipo_entrada: TIPO_ENTRADA_ATENDIMENTO,
    forma_pagamento: nomeForma.get(p.id_forma_pagamento) ?? "—",
    parcela: null,
    valor: arredondarMoeda(Number(p.valor_pago)),
    atendimento_id: args.idAgendamento,
    id_pagamento: p.id,
  }));

  const { error: insErr } = await supabase.from("caixa_movimento").insert(rows);
  if (insErr) throw new Error(insErr.message);
}

/** Monta descrição amigável para movimento de atendimento. */
export async function montarDescricaoMovimentoAtendimento(
  supabase: SupabaseClient,
  idAgendamento: number,
  idPaciente: number,
): Promise<string> {
  const { data: pac } = await supabase
    .from("pacientes")
    .select("nome_completo, nome_social")
    .eq("id", idPaciente)
    .maybeSingle();
  const nome =
    pac?.nome_completo?.trim() ||
    pac?.nome_social?.trim() ||
    `Paciente #${idPaciente}`;
  return `Pagamento atendimento #${idAgendamento} — ${nome}`;
}

/** Monta descrição amigável para taxa de agendamento. */
export async function montarDescricaoMovimentoTaxaAgendamento(
  supabase: SupabaseClient,
  idAgendamento: number,
  idPaciente: number,
): Promise<string> {
  const { data: pac } = await supabase
    .from("pacientes")
    .select("nome_completo, nome_social")
    .eq("id", idPaciente)
    .maybeSingle();
  const nome =
    pac?.nome_completo?.trim() ||
    pac?.nome_social?.trim() ||
    `Paciente #${idPaciente}`;
  return `Taxa agendamento — atendimento #${idAgendamento} (${nome})`;
}

/**
 * Registra fundo de caixa (troco) informado na abertura.
 * Idempotente por id_lancamento_caixa.
 */
export async function registrarCaixaMovimentoFundoAbertura(
  supabase: SupabaseClient,
  args: {
    idEmpresa: number;
    idLancamento: number;
    numeroCaixa: string;
    valor: number;
    dataMovimentacao?: string;
  },
): Promise<void> {
  const valor = arredondarMoeda(args.valor);
  if (valor <= 0) return;

  const { data: existente, error: exErr } = await supabase
    .from("caixa_movimento")
    .select("id")
    .eq("id_lancamento_caixa", args.idLancamento)
    .maybeSingle();
  if (exErr) throw new Error(exErr.message);
  if (existente) return;

  const numero = args.numeroCaixa.trim() || "—";
  const { error: insErr } = await supabase.from("caixa_movimento").insert({
    id_empresa: args.idEmpresa,
    data_movimentacao: args.dataMovimentacao ?? new Date().toISOString(),
    data_vencimento: null,
    descricao: `Fundo de caixa — abertura caixa ${numero}`,
    tipo_entrada: TIPO_ENTRADA_FUNDO_CAIXA,
    forma_pagamento: "Dinheiro",
    parcela: null,
    valor,
    atendimento_id: null,
    id_pagamento: null,
    id_taxa_rede: null,
    id_lancamento_caixa: args.idLancamento,
  });
  if (insErr) throw new Error(insErr.message);
}
