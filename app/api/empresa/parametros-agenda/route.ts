import { NextResponse } from "next/server";
import {
  corCorteTecnicoAgendaResolvida,
  parseHexCorAgenda,
} from "@/lib/agenda/cor-corte-tecnico-agenda";
import { getSession } from "@/lib/auth/session";
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
    .select("agenda_cor_corte_tecnico")
    .eq("id", empresaId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const raw = data?.agenda_cor_corte_tecnico as string | null | undefined;
  return NextResponse.json({
    agenda_cor_corte_tecnico: raw ?? null,
    agenda_cor_corte_tecnico_resolvida: corCorteTecnicoAgendaResolvida(raw),
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

  let body: { agenda_cor_corte_tecnico?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const rawIn = body.agenda_cor_corte_tecnico;
  let valorDb: string | null = null;
  if (rawIn === null || typeof rawIn === "undefined") {
    valorDb = null;
  } else if (typeof rawIn === "string" && rawIn.trim() === "") {
    valorDb = null;
  } else if (typeof rawIn === "string") {
    const parsed = parseHexCorAgenda(rawIn.trim());
    if (!parsed) {
      return NextResponse.json(
        { error: "Informe uma cor hexadecimal válida (#RRGGBB), ou vazio para o padrão do sistema." },
        { status: 400 },
      );
    }
    valorDb = parsed;
  } else {
    return NextResponse.json({ error: "agenda_cor_corte_tecnico inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("empresas")
    .update({ agenda_cor_corte_tecnico: valorDb })
    .eq("id", empresaId)
    .select("agenda_cor_corte_tecnico")
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const atual = data?.agenda_cor_corte_tecnico as string | null | undefined;
  return NextResponse.json({
    agenda_cor_corte_tecnico: atual ?? null,
    agenda_cor_corte_tecnico_resolvida: corCorteTecnicoAgendaResolvida(atual),
  });
}
