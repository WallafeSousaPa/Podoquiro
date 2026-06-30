import type { SupabaseClient } from "@supabase/supabase-js";
import type { RedeConfig } from "./config";
import { obterAccessTokenRede } from "./oauth";

export type RedeTransacaoConsulta = {
  tid: string;
  reference: string | null;
  status: string | null;
  returnCode: string | null;
  amount: number | null;
  respostaBruta: unknown;
};

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function extrairConsulta(tid: string, body: unknown): RedeTransacaoConsulta {
  const raiz = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const qr =
    raiz.qrCodeResponse && typeof raiz.qrCodeResponse === "object"
      ? (raiz.qrCodeResponse as Record<string, unknown>)
      : raiz;

  const status =
    pickString(qr, "status", "transactionStatus") ?? pickString(raiz, "status");
  const returnCode =
    pickString(raiz, "returnCode", "return_code") ?? pickString(qr, "returnCode", "return_code");
  const reference =
    pickString(raiz, "reference") ?? pickString(qr, "reference", "order_id", "orderId");
  const amountRaw = raiz.amount ?? qr.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw / 100
      : typeof amountRaw === "string" && amountRaw.trim()
        ? Number(amountRaw) / 100
        : null;

  return {
    tid,
    reference,
    status,
    returnCode,
    amount: Number.isFinite(amount) ? amount : null,
    respostaBruta: body,
  };
}

/** Consulta transação na e.Rede pelo TID (confirma status após webhook). */
export async function consultarTransacaoRede(
  config: RedeConfig,
  tid: string,
): Promise<RedeTransacaoConsulta> {
  const token = await obterAccessTokenRede(config);
  const url = `${config.transactionsBaseUrl.replace(/\/$/, "")}/v2/transactions/${encodeURIComponent(tid)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "returnMessage" in body
        ? String((body as Record<string, unknown>).returnMessage)
        : `HTTP ${res.status}`;
    throw new Error(`Consulta Rede falhou: ${msg}`);
  }
  return extrairConsulta(tid, body);
}

export type ResultadoProcessarPagamentoTaxa = {
  ok: boolean;
  idTaxa: number | null;
  idAgendamento: number | null;
  idEmpresa: number | null;
  mensagem: string;
};

/** Marca taxa como paga e confirma o agendamento vinculado. */
export async function processarPagamentoTaxaRede(
  supabase: SupabaseClient,
  args: {
    redeTid?: string | null;
    redeReferencia?: string | null;
    eventos?: string[];
    returnCode?: string | null;
  },
): Promise<ResultadoProcessarPagamentoTaxa> {
  const tid = args.redeTid?.trim() || null;
  const referencia = args.redeReferencia?.trim() || null;

  if (!tid && !referencia) {
    return {
      ok: false,
      idTaxa: null,
      idAgendamento: null,
      idEmpresa: null,
      mensagem: "Notificação sem TID ou referência.",
    };
  }

  let taxaRow: {
    id: number;
    id_agendamento: number;
    id_empresa: number;
    status: string;
  } | null = null;

  if (tid) {
    const { data } = await supabase
      .from("agendamento_taxa_rede")
      .select("id, id_agendamento, id_empresa, status")
      .eq("rede_tid", tid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    taxaRow = data;
  }

  if (!taxaRow && referencia) {
    const { data } = await supabase
      .from("agendamento_taxa_rede")
      .select("id, id_agendamento, id_empresa, status")
      .eq("rede_referencia", referencia)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    taxaRow = data;
  }

  if (!taxaRow) {
    return {
      ok: false,
      idTaxa: null,
      idAgendamento: null,
      idEmpresa: null,
      mensagem: tid
        ? `Nenhuma taxa local para TID ${tid}.`
        : `Nenhuma taxa local para referência ${referencia}.`,
    };
  }

  if (taxaRow.status === "pago") {
    return {
      ok: true,
      idTaxa: taxaRow.id,
      idAgendamento: taxaRow.id_agendamento,
      idEmpresa: taxaRow.id_empresa,
      mensagem: "Taxa já estava marcada como paga.",
    };
  }

  const eventos = args.eventos ?? [];
  const ehEstorno = eventos.includes("PV.REFUND_PIX");
  if (ehEstorno) {
    await supabase
      .from("agendamento_taxa_rede")
      .update({ status: "cancelado" })
      .eq("id", taxaRow.id);
    return {
      ok: true,
      idTaxa: taxaRow.id,
      idAgendamento: taxaRow.id_agendamento,
      idEmpresa: taxaRow.id_empresa,
      mensagem: "Estorno Pix registrado (taxa cancelada).",
    };
  }

  const rc = args.returnCode?.trim();
  const aprovado =
    eventos.includes("PV.UPDATE_TRANSACTION_PIX") ||
    rc === "00" ||
    rc === "0";

  if (!aprovado) {
    return {
      ok: false,
      idTaxa: taxaRow.id,
      idAgendamento: taxaRow.id_agendamento,
      idEmpresa: taxaRow.id_empresa,
      mensagem: `Evento/returnCode não indica pagamento aprovado: ${eventos.join(", ") || rc || "—"}.`,
    };
  }

  const agora = new Date().toISOString();
  const patchTaxa: Record<string, unknown> = {
    status: "pago",
    pago_em: agora,
  };
  if (tid) patchTaxa.rede_tid = tid;

  await supabase.from("agendamento_taxa_rede").update(patchTaxa).eq("id", taxaRow.id);

  await supabase
    .from("agendamentos")
    .update({ status: "confirmado" })
    .eq("id", taxaRow.id_agendamento)
    .eq("status", "pendente");

  return {
    ok: true,
    idTaxa: taxaRow.id,
    idAgendamento: taxaRow.id_agendamento,
    idEmpresa: taxaRow.id_empresa,
    mensagem: "Pagamento confirmado; agendamento atualizado para confirmado.",
  };
}
