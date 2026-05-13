import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  type LinhaPlanilhaBruta,
  previewImportacaoCompleto,
} from "@/lib/agenda/importacao-planilha-servico";
import { MAX_LINHAS_IMPORTACAO_AGENDAMENTOS } from "@/lib/agenda/importacao-planilha-limites";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let body: { linhas?: LinhaPlanilhaBruta[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const linhas = Array.isArray(body.linhas) ? body.linhas : [];
  if (linhas.length === 0) {
    return NextResponse.json({ error: "Envie ao menos uma linha." }, { status: 400 });
  }
  if (linhas.length > MAX_LINHAS_IMPORTACAO_AGENDAMENTOS) {
    return NextResponse.json(
      {
        error: `No máximo ${MAX_LINHAS_IMPORTACAO_AGENDAMENTOS.toLocaleString("pt-BR")} linhas por importação.`,
      },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  try {
    const { linhasPendentes, linhasProntas, catalogos, resumo } =
      await previewImportacaoCompleto(supabase, empresaId, linhas);
    return NextResponse.json({ linhasPendentes, linhasProntas, catalogos, resumo });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao montar pré-visualização." },
      { status: 500 },
    );
  }
}
