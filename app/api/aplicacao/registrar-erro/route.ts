import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { registrarErroAplicacao } from "@/lib/aplicacao/registrar-erro-aplicacao";
import { createAdminClient } from "@/lib/supabase/admin";

function toPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Permite ao cliente registrar falhas que não produzem resposta JSON da API
 * (rede, parse, timeout) e devolver um `codigo_erro` ao usuário.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: {
    origem?: string;
    mensagem_curta?: string;
    detalhe?: string;
    id_paciente?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const origem = String(body.origem ?? "cliente:desconhecido").trim() || "cliente:desconhecido";
  const detalhe = String(body.detalhe ?? "").trim();
  if (!detalhe) {
    return NextResponse.json({ error: "Campo detalhe é obrigatório." }, { status: 400 });
  }

  const idUsuario = toPositiveNumber(session.sub);
  const idEmpresa = toPositiveNumber(session.idEmpresa);
  const idPaciente = toPositiveNumber(body.id_paciente);

  const supabase = createAdminClient();
  const reg = await registrarErroAplicacao(supabase, {
    origem: `cliente:${origem}`,
    idUsuario,
    idEmpresa,
    idPaciente,
    mensagemUsuario: body.mensagem_curta?.trim() || "Erro no cliente",
    detalheTecnico: detalhe,
    userAgent: request.headers.get("user-agent"),
  });

  if ("falha" in reg) {
    return NextResponse.json(
      { error: "Não foi possível registrar o código de suporte." },
      { status: 500 },
    );
  }

  return NextResponse.json({ codigo_erro: reg.id });
}
