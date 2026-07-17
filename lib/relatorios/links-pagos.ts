import type { SupabaseClient } from "@supabase/supabase-js";
import { labelFormaPagamentoTaxaAsaas } from "@/lib/financeiro/taxa-forma-pagamento";
import { nomeExibicaoPaciente } from "@/lib/pacientes";
import { dayStartIsoBr, nextDayStartIsoBr } from "@/lib/relatorios/periodo";

export type LinkPagoMeio = "cartao" | "dinheiro" | "pix" | "outros";

export type LinkPagoRow = {
  id_taxa: number;
  id_agendamento: number;
  id_paciente: number | null;
  id_usuario: number | null;
  dia: string;
  pago_em: string;
  valor: number;
  forma_pagamento: string;
  meio: LinkPagoMeio;
  paciente: string;
  profissional: string;
  data_hora_atendimento: string;
};

export type LinkPagoPorMeio = {
  meio: LinkPagoMeio;
  rotulo: string;
  quantidade: number;
  valor: number;
};

export type LinksPagosData = {
  periodo: { data_inicio: string; data_fim: string };
  resumo: {
    quantidade: number;
    valor_total: number;
  };
  por_meio: LinkPagoPorMeio[];
  rows: LinkPagoRow[];
};

const MEIOS_ORDEM: { meio: LinkPagoMeio; rotulo: string }[] = [
  { meio: "cartao", rotulo: "Cartão" },
  { meio: "dinheiro", rotulo: "Dinheiro" },
  { meio: "pix", rotulo: "PIX" },
  { meio: "outros", rotulo: "Outros" },
];

/** Agrupa rótulo de forma de pagamento em cartão / dinheiro / PIX / outros. */
export function bucketMeioPagamento(forma: string): LinkPagoMeio {
  const f = forma.trim().toLowerCase();
  if (!f) return "outros";
  if (f.includes("pix")) return "pix";
  if (
    f.includes("dinheiro") ||
    f.includes("espécie") ||
    f.includes("especie") ||
    f.includes("numerário") ||
    f.includes("numerario")
  ) {
    return "dinheiro";
  }
  if (
    f.includes("cartão") ||
    f.includes("cartao") ||
    f.includes("crédito") ||
    f.includes("credito") ||
    f.includes("débito") ||
    f.includes("debito")
  ) {
    return "cartao";
  }
  return "outros";
}

type PacienteEmbed = {
  nome_completo?: string | null;
  nome_social?: string | null;
};

type UsuarioEmbed = {
  nome_completo?: string | null;
  usuario?: string | null;
};

type AgendamentoEmbed = {
  id: number;
  id_paciente?: number | null;
  id_usuario?: number | null;
  data_hora_inicio: string;
  pacientes?: PacienteEmbed | PacienteEmbed[] | null;
  usuarios?: UsuarioEmbed | UsuarioEmbed[] | null;
};

type CaixaMovEmbed = { forma_pagamento?: string | null };

type TaxaRow = {
  id: number;
  id_agendamento: number;
  valor: number;
  pago_em: string | null;
  pago_em_dinheiro: boolean | null;
  asaas_payment_id: string | null;
  asaas_payment_link_id: string | null;
  asaas_payment_link_url: string | null;
  asaas_resposta: unknown;
  rede_tid: string | null;
  rede_payment_link_id: string | null;
  agendamentos: AgendamentoEmbed | AgendamentoEmbed[] | null;
  caixa_movimento: CaixaMovEmbed | CaixaMovEmbed[] | null;
};

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
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

function foiLinkPagamento(t: TaxaRow): boolean {
  if (t.pago_em_dinheiro) return false;
  return Boolean(
    t.asaas_payment_id?.trim() ||
      t.asaas_payment_link_id?.trim() ||
      t.asaas_payment_link_url?.trim() ||
      t.rede_payment_link_id?.trim() ||
      t.rede_tid?.trim(),
  );
}

function resolverFormaPagamento(t: TaxaRow): string {
  const mov = one(t.caixa_movimento);
  const doCaixa = mov?.forma_pagamento?.trim();
  if (doCaixa) return doCaixa;

  if (t.rede_tid?.trim() || t.rede_payment_link_id?.trim()) {
    return "PIX";
  }
  if (t.asaas_payment_id?.trim() || t.asaas_payment_link_id?.trim()) {
    return labelFormaPagamentoTaxaAsaas(t.asaas_resposta) ?? "Link pagamento";
  }
  return "Link pagamento";
}

function nomeProfissional(u: UsuarioEmbed | null): string {
  if (!u) return "—";
  return u.nome_completo?.trim() || u.usuario?.trim() || "—";
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymdFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Primeiro dia do mês atual até hoje (não passa do dia corrente). */
export function periodoMesAtualYmd(ref: Date = new Date()): {
  dataInicio: string;
  dataFim: string;
} {
  const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
  return {
    dataInicio: ymdFromDate(inicio),
    dataFim: ymdFromDate(ref),
  };
}

/** Primeiro e último dia do mês civil anterior. */
export function periodoMesPassadoYmd(ref: Date = new Date()): {
  dataInicio: string;
  dataFim: string;
} {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const inicio = new Date(y, m - 1, 1);
  const fim = new Date(y, m, 0);
  return {
    dataInicio: ymdFromDate(inicio),
    dataFim: ymdFromDate(fim),
  };
}

export async function gerarRelatorioLinksPagos(
  supabase: SupabaseClient,
  args: { idEmpresa: number; dataInicio: string; dataFim: string },
): Promise<LinksPagosData> {
  const { data, error } = await supabase
    .from("agendamento_taxa_rede")
    .select(
      `
      id,
      id_agendamento,
      valor,
      pago_em,
      pago_em_dinheiro,
      asaas_payment_id,
      asaas_payment_link_id,
      asaas_payment_link_url,
      asaas_resposta,
      rede_tid,
      rede_payment_link_id,
      agendamentos!inner (
        id,
        id_paciente,
        id_usuario,
        data_hora_inicio,
        pacientes ( nome_completo, nome_social ),
        usuarios ( nome_completo, usuario )
      ),
      caixa_movimento ( forma_pagamento )
    `,
    )
    .eq("id_empresa", args.idEmpresa)
    .eq("status", "pago")
    .not("pago_em", "is", null)
    .gte("pago_em", dayStartIsoBr(args.dataInicio))
    .lt("pago_em", nextDayStartIsoBr(args.dataFim))
    .order("pago_em", { ascending: false });

  if (error) throw new Error(error.message);

  const rows: LinkPagoRow[] = [];
  for (const raw of (data ?? []) as TaxaRow[]) {
    if (!foiLinkPagamento(raw)) continue;
    if (!raw.pago_em) continue;

    const ag = one(raw.agendamentos);
    if (!ag) continue;

    const pac = one(ag.pacientes);
    const forma = resolverFormaPagamento(raw);
    const valor = Math.round(Number(raw.valor) * 100) / 100;
    rows.push({
      id_taxa: raw.id,
      id_agendamento: raw.id_agendamento,
      id_paciente: ag.id_paciente ?? null,
      id_usuario: ag.id_usuario ?? null,
      dia: ymdBrFromIso(raw.pago_em),
      pago_em: raw.pago_em,
      valor,
      forma_pagamento: forma,
      meio: bucketMeioPagamento(forma),
      paciente: pac
        ? nomeExibicaoPaciente({
            nome_completo: pac.nome_completo ?? null,
            nome_social: pac.nome_social ?? null,
          })
        : `Paciente`,
      profissional: nomeProfissional(one(ag.usuarios)),
      data_hora_atendimento: ag.data_hora_inicio,
    });
  }

  const valorTotal = Math.round(rows.reduce((s, r) => s + r.valor, 0) * 100) / 100;

  const totaisMeio = new Map<LinkPagoMeio, { quantidade: number; valor: number }>();
  for (const m of MEIOS_ORDEM) {
    totaisMeio.set(m.meio, { quantidade: 0, valor: 0 });
  }
  for (const r of rows) {
    const t = totaisMeio.get(r.meio)!;
    t.quantidade += 1;
    t.valor = Math.round((t.valor + r.valor) * 100) / 100;
  }

  const por_meio: LinkPagoPorMeio[] = MEIOS_ORDEM.map(({ meio, rotulo }) => {
    const t = totaisMeio.get(meio)!;
    return {
      meio,
      rotulo,
      quantidade: t.quantidade,
      valor: t.valor,
    };
  });

  return {
    periodo: { data_inicio: args.dataInicio, data_fim: args.dataFim },
    resumo: {
      quantidade: rows.length,
      valor_total: valorTotal,
    },
    por_meio,
    rows,
  };
}
