import { NextResponse } from "next/server";
import {
  getPodeVerTodosAgendamentos,
  getUsuarioAgendaSomentePropriaColuna,
} from "@/lib/agenda/permissoes-calendario";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

type RpcPayload = {
  esperado: {
    dinheiro: number;
    pix: number;
    cartao_credito: number;
    cartao_debito: number;
    outros: number;
  };
  por_forma: { nome: string; total: number; bucket: string }[];
};

export async function GET(request: Request) {
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

  const data =
    new URL(request.url).searchParams.get("data")?.trim() ?? "";
  if (!DATA_RE.test(data)) {
    return NextResponse.json(
      { error: "Parâmetro data inválido (YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const [podeVerTodos, somentePropriaColuna] = await Promise.all([
    getPodeVerTodosAgendamentos(supabase, sessionUserId),
    getUsuarioAgendaSomentePropriaColuna(supabase, sessionUserId),
  ]);

  const verTodosEmpresa =
    podeVerTodos && !somentePropriaColuna;

  const { data: raw, error } = await supabase.rpc("caixa_resumo_pagamentos_dia", {
    p_id_empresa: empresaId,
    p_data: data,
    p_id_usuario: verTodosEmpresa ? null : sessionUserId,
  });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const j = raw as RpcPayload | null;
  const esp = j?.esperado ?? {
    dinheiro: 0,
    pix: 0,
    cartao_credito: 0,
    cartao_debito: 0,
    outros: 0,
  };

  return NextResponse.json({
    data,
    esperado: {
      dinheiro: Number(esp.dinheiro),
      pix: Number(esp.pix),
      cartao_credito: Number(esp.cartao_credito),
      cartao_debito: Number(esp.cartao_debito),
      outros: Number(esp.outros),
    },
    por_forma: Array.isArray(j?.por_forma) ? j?.por_forma : [],
  });
}
