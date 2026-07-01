import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUsuarioPodeRelatorioCaixa } from "@/lib/dashboard/menu-grupo";
import {
  MAX_CARACTERES_MENSAGEM_WHATSAPP_CLIENTES_AUSENTES,
  MENSAGEM_PADRAO_WHATSAPP_CLIENTES_AUSENTES,
  mensagemWhatsappClientesAusentesParaExibicao,
} from "@/lib/relatorios/clientes-ausentes-whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("empresas")
    .select("mensagem_whatsapp_clientes_ausentes")
    .eq("id", empresaId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const stored = String(data.mensagem_whatsapp_clientes_ausentes ?? "").trim();
  return NextResponse.json({
    mensagem: stored,
    mensagem_exibicao: mensagemWhatsappClientesAusentesParaExibicao(stored),
    mensagem_padrao: MENSAGEM_PADRAO_WHATSAPP_CLIENTES_AUSENTES,
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  let body: { mensagem?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const mensagem =
    body.mensagem == null || typeof body.mensagem !== "string"
      ? ""
      : body.mensagem.trim();

  if (mensagem.length > MAX_CARACTERES_MENSAGEM_WHATSAPP_CLIENTES_AUSENTES) {
    return NextResponse.json(
      {
        error: `A mensagem pode ter no máximo ${MAX_CARACTERES_MENSAGEM_WHATSAPP_CLIENTES_AUSENTES} caracteres.`,
      },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const pode = await getUsuarioPodeRelatorioCaixa(supabase, sessionUserId);
  if (!pode) {
    return NextResponse.json(
      { error: "Sem permissão para alterar a mensagem." },
      { status: 403 },
    );
  }

  const { data, error } = await supabase
    .from("empresas")
    .update({ mensagem_whatsapp_clientes_ausentes: mensagem })
    .eq("id", empresaId)
    .select("mensagem_whatsapp_clientes_ausentes")
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const stored = String(data.mensagem_whatsapp_clientes_ausentes ?? "").trim();
  return NextResponse.json({
    mensagem: stored,
    mensagem_exibicao: mensagemWhatsappClientesAusentesParaExibicao(stored),
  });
}
