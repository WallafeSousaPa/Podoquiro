import { NextResponse } from "next/server";
import {
  sincronizarEmissaoFocusPorRef,
  statusInternoDeFocus,
} from "@/lib/focusnfe";
import { webhookAutorizado } from "@/lib/focusnfe/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

/** Health-check simples (a Focus chama via POST; o GET ajuda a validar a URL no navegador). */
export async function GET() {
  return NextResponse.json({ ok: true, webhook: "focusnfe", metodo: "POST" });
}

function extrairCampo(body: unknown, chaves: string[]): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  for (const k of chaves) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

/**
 * Receiver do gatilho (webhook) da Focus NFe para o evento `nfse`.
 * Ao receber a notificação, reconsulta a nota pela `ref` e atualiza o status local,
 * refletindo automaticamente em Nota Fiscal › Consultar.
 */
export async function POST(request: Request) {
  if (!webhookAutorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    try {
      const txt = await request.text();
      body = { raw: txt };
    } catch {
      body = null;
    }
  }

  const ref = extrairCampo(body, ["ref", "referencia"]);
  const statusRecebido = extrairCampo(body, ["status"]);
  const evento = extrairCampo(body, ["event", "evento", "tipo"]);

  const supabase = createAdminClient();

  // Registro de auditoria sempre, mesmo que a ref não exista localmente.
  let idEmpresa: number | null = null;
  let idEmissao: string | null = null;
  let processado = false;
  let resultadoTexto: string;

  try {
    if (!ref) {
      resultadoTexto = "Notificação sem `ref`; nada a sincronizar.";
    } else {
      const sync = await sincronizarEmissaoFocusPorRef(supabase, ref);
      if (!sync) {
        resultadoTexto = `Nenhuma emissão local para ref ${ref}.`;
      } else {
        idEmpresa = sync.emissao.id_empresa;
        idEmissao = sync.emissao.id;
        processado = sync.resultado.ok;
        resultadoTexto = sync.resultado.ok
          ? `Sincronizada: status ${sync.resultado.status_focus} (${sync.resultado.status_interno}).`
          : `Falha ao sincronizar: ${sync.resultado.error ?? "erro desconhecido"}.`;
      }
    }
  } catch (e) {
    resultadoTexto =
      e instanceof Error ? `Erro: ${e.message}` : "Erro inesperado ao processar.";
  }

  try {
    await supabase.from("focusnfe_webhook_eventos").insert({
      id_empresa: idEmpresa,
      id_emissao: idEmissao,
      focus_ref: ref,
      evento,
      status_recebido: statusRecebido,
      payload: body && typeof body === "object" ? body : { valor: body },
      processado,
      resultado: resultadoTexto,
    });
  } catch (e) {
    console.error("Falha ao gravar log do webhook Focus:", e);
  }

  // Sempre 200 para a Focus não reenfileirar indefinidamente.
  return NextResponse.json({
    ok: true,
    ref,
    status_interno: statusRecebido ? statusInternoDeFocus(statusRecebido) : null,
    processado,
  });
}
