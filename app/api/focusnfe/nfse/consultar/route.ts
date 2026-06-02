import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNfseNoCaixa } from "@/lib/dashboard/nota-fiscal-permissao";
import {
  FocusNfeApiError,
  focusConsultarNfse,
  montarPatchEmissaoFocus,
  obterConfigFocusNfe,
  obterTokenFocusNfe,
  statusInternoDeFocus,
  type EmissaoFocusParcial,
} from "@/lib/focusnfe";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(request: Request) {
  const session = await getSession();
  const negado = await respostaSeSemPermissaoNfseNoCaixa(session);
  if (negado) return negado;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let body: { id?: string; focus_ref?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
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

  let q = supabase
    .from("nfse_focus_emissoes")
    .select("*")
    .eq("id_empresa", empresaId);

  if (body.id) {
    q = q.eq("id", body.id);
  } else if (body.focus_ref?.trim()) {
    q = q.eq("focus_ref", body.focus_ref.trim());
  } else {
    return NextResponse.json({ error: "Informe id ou focus_ref." }, { status: 400 });
  }

  const { data: emissao, error } = await q.maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!emissao) {
    return NextResponse.json({ error: "Emissão não encontrada." }, { status: 404 });
  }

  const ref = emissao.focus_ref as string;

  let consulta;
  try {
    consulta = await focusConsultarNfse(config.baseUrl, token, ref);
  } catch (e) {
    if (e instanceof FocusNfeApiError) {
      return NextResponse.json(
        { error: e.message, detalhe: e.body },
        { status: e.status >= 400 && e.status < 600 ? e.status : 502 },
      );
    }
    throw e;
  }

  const statusFocus = consulta.status ?? (emissao.status as string);
  const patch = montarPatchEmissaoFocus(emissao as EmissaoFocusParcial, consulta);

  const { data: atualizado, error: upErr } = await supabase
    .from("nfse_focus_emissoes")
    .update(patch)
    .eq("id", emissao.id)
    .select(
      "id, focus_ref, status, numero_nfse, codigo_verificacao, numero_rps, serie_rps, url_danfse, error_message, emitted_at, valor_servicos, discriminacao",
    )
    .single();

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    emissao: atualizado,
    focus: consulta,
    status_interno: statusInternoDeFocus(statusFocus),
  });
}
