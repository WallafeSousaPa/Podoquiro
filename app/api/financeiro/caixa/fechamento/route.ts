import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  compararComSistema,
  type EsperadoCaixa,
  type InformadoCaixa,
} from "@/lib/financeiro/caixa-comparacao";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseMoney(v: unknown): number {
  if (v === null || typeof v === "undefined") return 0;
  if (typeof v === "number") {
    return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : NaN;
  }
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return 0;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
  }
  return NaN;
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

  const sessionUserId = Number(session.sub);
  if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  let body: {
    data_referencia?: string;
    valor_dinheiro?: unknown;
    valor_cartao_credito?: unknown;
    valor_cartao_debito?: unknown;
    valor_pix?: unknown;
    valor_link_pagamento?: unknown;
    confirmou_divergencia?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const dataRef =
    typeof body.data_referencia === "string" ? body.data_referencia.trim() : "";
  if (!DATA_RE.test(dataRef)) {
    return NextResponse.json(
      { error: "Informe data_referencia (YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  const vd = parseMoney(body.valor_dinheiro);
  const vcc = parseMoney(body.valor_cartao_credito);
  const vcd = parseMoney(body.valor_cartao_debito);
  const vp = parseMoney(body.valor_pix);
  const vl = parseMoney(body.valor_link_pagamento);
  if ([vd, vcc, vcd, vp, vl].some((x) => Number.isNaN(x))) {
    return NextResponse.json(
      { error: "Informe valores numéricos válidos (≥ 0)." },
      { status: 400 },
    );
  }

  const confirmouDivergencia = body.confirmou_divergencia === true;

  const supabase = createAdminClient();

  const { data: uOk, error: uErr } = await supabase
    .from("usuarios")
    .select("id")
    .eq("id", sessionUserId)
    .eq("id_empresa", empresaId)
    .maybeSingle();
  if (uErr) {
    console.error(uErr);
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }
  if (!uOk) {
    return NextResponse.json({ error: "Usuário inválido." }, { status: 403 });
  }

  const informado: InformadoCaixa = {
    dinheiro: vd,
    pix: vp,
    cartao_credito: vcc,
    cartao_debito: vcd,
    link_pagamento: vl,
  };

  let esperado: EsperadoCaixa = {
    dinheiro: 0,
    pix: 0,
    cartao_credito: 0,
    cartao_debito: 0,
    link_pagamento: 0,
    outros: 0,
  };
  let temResumo = false;
  const { data: rawResumo, error: resumoErr } = await supabase.rpc(
    "caixa_resumo_pagamentos_dia",
    {
      p_id_empresa: empresaId,
      p_data: dataRef,
      p_id_usuario: null,
    },
  );
  if (!resumoErr && rawResumo && typeof rawResumo === "object") {
    const esp = (rawResumo as { esperado?: EsperadoCaixa }).esperado;
    if (esp) {
      temResumo = true;
      esperado = {
        dinheiro: Number(esp.dinheiro) || 0,
        pix: Number(esp.pix) || 0,
        cartao_credito: Number(esp.cartao_credito) || 0,
        cartao_debito: Number(esp.cartao_debito) || 0,
        link_pagamento: Number(esp.link_pagamento ?? 0) || 0,
        outros: Number(esp.outros) || 0,
      };
    }
  }

  const divergencias = temResumo ? compararComSistema(esperado, informado) : [];
  if (divergencias.length > 0 && !confirmouDivergencia) {
    return NextResponse.json(
      {
        error: "Confirme a sobra ou falta para fechar o caixa.",
        divergencias,
      },
      { status: 409 },
    );
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "caixa_fechar_com_relatorio",
    {
      p_id_empresa: empresaId,
      p_data_referencia: dataRef,
      p_id_responsavel: sessionUserId,
      p_valor_dinheiro: vd,
      p_valor_cartao_credito: vcc,
      p_valor_cartao_debito: vcd,
      p_valor_pix: vp,
      p_valor_link_pagamento: vl,
      p_confirmou_divergencia: divergencias.length > 0,
      p_esperado_dinheiro: esperado.dinheiro,
      p_esperado_cartao_credito: esperado.cartao_credito,
      p_esperado_cartao_debito: esperado.cartao_debito,
      p_esperado_pix: esperado.pix,
      p_esperado_link_pagamento: esperado.link_pagamento,
    },
  );

  if (rpcErr) {
    console.error(rpcErr);
    const msg = rpcErr.message ?? "";
    if (msg.includes("CAIXA_NAO_ABERTO")) {
      return NextResponse.json(
        { error: "Abra o caixa desta data antes de fechar." },
        { status: 400 },
      );
    }
    if (msg.includes("CAIXA_JA_FECHADO")) {
      return NextResponse.json(
        { error: "O caixa desta data já foi fechado." },
        { status: 409 },
      );
    }
    if (msg.includes("VALORES_INVALIDOS")) {
      return NextResponse.json(
        { error: "Valores inválidos." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  type RpcRow = { id_lancamento: number; id_relatorio: number };
  const row = (
    Array.isArray(rpcData) ? rpcData[0] : rpcData
  ) as RpcRow | undefined;

  return NextResponse.json({
    data: {
      id_lancamento: row?.id_lancamento,
      id_relatorio: row?.id_relatorio,
    },
  });
}
