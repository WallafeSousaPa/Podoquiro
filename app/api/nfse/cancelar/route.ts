import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  notaasCancelar,
  NotaasApiError,
  obterApiKeyNotaas,
  sincronizarEmissaoNfse,
} from "@/lib/notaas";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Solicita cancelamento na Notaas e sincroniza o registro local. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let body: { id?: string; motivo?: string };
  try {
    body = (await request.json()) as { id?: string; motivo?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Informe o id da emissão." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: row, error: loadErr } = await supabase
    .from("nfse_emissoes")
    .select("id, id_empresa, notaas_invoice_id, status")
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Emissão não encontrada." }, { status: 404 });
  }
  if (!row.notaas_invoice_id) {
    return NextResponse.json({ error: "Nota sem vínculo Notaas." }, { status: 400 });
  }
  if (row.status === "cancelada") {
    return NextResponse.json({ error: "Nota já cancelada." }, { status: 409 });
  }
  if (row.status !== "emitida" && row.status !== "contingencia") {
    return NextResponse.json(
      { error: "Somente notas emitidas ou em contingência podem ser canceladas." },
      { status: 409 },
    );
  }

  const apiKey = await obterApiKeyNotaas(supabase, empresaId);
  if (!apiKey) {
    return NextResponse.json(
      { error: "Configure NOTAAS_API_KEY ou a chave da empresa." },
      { status: 503 },
    );
  }

  try {
    await notaasCancelar(apiKey, {
      invoiceId: row.notaas_invoice_id as string,
      motivo: body.motivo?.trim()?.slice(0, 255) || undefined,
    });
  } catch (e) {
    if (e instanceof NotaasApiError) {
      return NextResponse.json({ error: e.message, detalhe: e.body }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "Falha ao cancelar.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const sync = await sincronizarEmissaoNfse(supabase, empresaId, {
    id: row.id as string,
    notaas_invoice_id: row.notaas_invoice_id as string,
    status: row.status as string,
  });

  return NextResponse.json({ ok: true, sync });
}
