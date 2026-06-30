import { NextResponse } from "next/server";
import { obterConfigRede } from "@/lib/rede/config";
import {
  consultarTransacaoRede,
  processarPagamentoTaxaRede,
} from "@/lib/rede/processar-webhook";
import { redeWebhookAutorizado } from "@/lib/rede/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

/** Health-check da URL de webhook. */
export async function GET() {
  return NextResponse.json({ ok: true, webhook: "rede", metodo: "POST" });
}

function extrairCampo(body: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = body[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function parseFormUrlEncoded(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split("&")) {
    const [k, v] = part.split("=");
    if (!k) continue;
    out[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent(
      (v ?? "").replace(/\+/g, " "),
    );
  }
  return out;
}

async function lerCorpo(request: Request): Promise<{
  body: unknown;
  contentType: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return { body: await request.json(), contentType };
    } catch {
      return { body: null, contentType };
    }
  }
  const raw = await request.text();
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return { body: parseFormUrlEncoded(raw), contentType };
  }
  if (raw.trim().startsWith("{")) {
    try {
      return { body: JSON.parse(raw) as unknown, contentType };
    } catch {
      return { body: { raw }, contentType };
    }
  }
  return { body: raw ? { raw } : null, contentType };
}

function extrairDadosNotificacao(body: unknown): {
  tid: string | null;
  referencia: string | null;
  eventos: string[];
  returnCode: string | null;
  companyNumber: string | null;
} {
  if (!body || typeof body !== "object") {
    return { tid: null, referencia: null, eventos: [], returnCode: null, companyNumber: null };
  }

  const o = body as Record<string, unknown>;
  const data =
    o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : null;

  let eventos: string[] = [];
  if (Array.isArray(o.events)) {
    eventos = o.events.filter((e): e is string => typeof e === "string");
  } else if (typeof o.event === "string") {
    eventos = [o.event];
  }

  const tid =
    extrairCampo(data ?? {}, "id", "tid") ??
    extrairCampo(o, "tid", "id", "transactionId", "transaction_id");

  const referencia =
    extrairCampo(o, "reference", "referencia", "order_id", "orderId") ??
    extrairCampo(data ?? {}, "reference", "order_id");

  const returnCode = extrairCampo(o, "returncode", "returnCode", "return_code");
  const companyNumber = extrairCampo(o, "companyNumber", "company_number", "merchant_id");

  return { tid, referencia, eventos, returnCode, companyNumber };
}

/**
 * Webhook Rede — eventos Pix/QR Code (ex.: PV.UPDATE_TRANSACTION_PIX).
 * Documentação: https://developer.userede.com.br/e-rede
 */
export async function POST(request: Request) {
  if (!redeWebhookAutorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { body, contentType } = await lerCorpo(request);
  const dados = extrairDadosNotificacao(body);
  const supabase = createAdminClient();

  let processado = false;
  let resultado = "Aguardando processamento.";
  let idEmpresa: number | null = null;
  let idTaxa: number | null = null;

  try {
    let proc = await processarPagamentoTaxaRede(supabase, {
      redeTid: dados.tid,
      redeReferencia: dados.referencia,
      eventos: dados.eventos,
      returnCode: dados.returnCode,
    });

    if (!proc.ok && dados.tid) {
      const redeConfig = obterConfigRede();
      if (redeConfig) {
        try {
          const tx = await consultarTransacaoRede(redeConfig, dados.tid);
          const statusOk =
            tx.returnCode === "00" ||
            ["approved", "paid", "captured", "done"].includes(
              (tx.status ?? "").toLowerCase(),
            );
          if (statusOk) {
            proc = await processarPagamentoTaxaRede(supabase, {
              redeTid: dados.tid,
              redeReferencia: tx.reference,
              eventos: ["PV.UPDATE_TRANSACTION_PIX"],
              returnCode: tx.returnCode,
            });
          } else {
            resultado = `Consulta Rede: status ${tx.status ?? "—"}, returnCode ${tx.returnCode ?? "—"}.`;
          }
        } catch (e) {
          resultado = proc.mensagem + (e instanceof Error ? ` (${e.message})` : "");
        }
      } else {
        resultado = proc.mensagem;
      }
    } else {
      resultado = proc.mensagem;
    }

    processado = proc.ok;
    idEmpresa = proc.idEmpresa;
    idTaxa = proc.idTaxa;
  } catch (e) {
    resultado = e instanceof Error ? e.message : "Erro ao processar webhook.";
  }

  try {
    await supabase.from("rede_webhook_eventos").insert({
      id_empresa: idEmpresa,
      id_taxa_rede: idTaxa,
      rede_tid: dados.tid,
      evento: dados.eventos.join(", ") || null,
      payload:
        body && typeof body === "object"
          ? { ...(body as object), _contentType: contentType }
          : { valor: body, _contentType: contentType },
      processado,
      resultado,
    });
  } catch (e) {
    console.error("Falha ao gravar log webhook Rede:", e);
  }

  return NextResponse.json({
    ok: true,
    processado,
    tid: dados.tid,
    eventos: dados.eventos,
  });
}
