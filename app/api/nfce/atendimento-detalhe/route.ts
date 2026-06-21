import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNfseNoCaixa } from "@/lib/dashboard/nota-fiscal-permissao";
import { carregarContextoNfceAtendimento } from "@/lib/financeiro/nfce-atendimento";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Detalhes do atendimento para emissão ou reimpressão de NFC-e (DANFE) no caixa. */
export async function GET(request: Request) {
  const session = await getSession();
  const bloqueio = await respostaSeSemPermissaoNfseNoCaixa(session);
  if (bloqueio) return bloqueio;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const idAgendamento = Number(new URL(request.url).searchParams.get("id_agendamento"));
  if (!Number.isFinite(idAgendamento) || idAgendamento <= 0) {
    return NextResponse.json({ error: "Informe id_agendamento válido." }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const ctx = await carregarContextoNfceAtendimento(supabase, empresaId, idAgendamento);
    return NextResponse.json(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao carregar o atendimento.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
