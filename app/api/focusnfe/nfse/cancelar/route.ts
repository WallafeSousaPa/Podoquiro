import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNfseNoCaixa } from "@/lib/dashboard/nota-fiscal-permissao";
import {
  FocusNfeApiError,
  focusCancelarNfse,
  obterConfigFocusNfe,
  obterTokenFocusNfe,
  podeCancelarFocusNfse,
} from "@/lib/focusnfe";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Cancela NFS-e autorizada na Focus NFe e atualiza o registro local. */
export async function POST(request: Request) {
  const session = await getSession();
  const negado = await respostaSeSemPermissaoNfseNoCaixa(session);
  if (negado) return negado;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let body: { id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Informe o id da emissão." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const config = await obterConfigFocusNfe(supabase, empresaId);
  if (!config) {
    return NextResponse.json({ error: "Focus NFe não configurado." }, { status: 400 });
  }

  const token = await obterTokenFocusNfe(supabase, empresaId);
  if (!token) {
    return NextResponse.json({ error: "Token Focus NFe não configurado." }, { status: 400 });
  }

  const { data: emissao, error } = await supabase
    .from("nfse_focus_emissoes")
    .select("id, focus_ref, status")
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!emissao) {
    return NextResponse.json({ error: "Emissão não encontrada." }, { status: 404 });
  }

  const statusAtual = String(emissao.status ?? "");
  if (statusAtual.toLowerCase() === "cancelado") {
    return NextResponse.json({ error: "NFS-e já cancelada." }, { status: 409 });
  }
  if (!podeCancelarFocusNfse(statusAtual)) {
    return NextResponse.json(
      { error: "Somente NFS-e autorizada pode ser cancelada." },
      { status: 409 },
    );
  }

  const ref = emissao.focus_ref as string;

  let cancelamento;
  try {
    cancelamento = await focusCancelarNfse(config.baseUrl, token, ref);
  } catch (e) {
    if (e instanceof FocusNfeApiError) {
      return NextResponse.json(
        { error: e.message, detalhe: e.body },
        { status: e.status >= 400 && e.status < 600 ? e.status : 502 },
      );
    }
    throw e;
  }

  const statusFocus = (cancelamento.status ?? "cancelado").toLowerCase();

  const { data: atualizado, error: upErr } = await supabase
    .from("nfse_focus_emissoes")
    .update({
      status: statusFocus,
      error_message: null,
      payload_resposta: cancelamento,
    })
    .eq("id", emissao.id)
    .select(
      "id, focus_ref, status, numero_nfse, codigo_verificacao, numero_rps, serie_rps, url_danfse, error_message, valor_servicos, discriminacao",
    )
    .single();

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    emissao: atualizado,
    focus: cancelamento,
  });
}
