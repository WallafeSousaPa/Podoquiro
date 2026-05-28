import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { obterApiKeyNotaas, sincronizarEmissaoNfse } from "@/lib/notaas";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Consulta status na Notaas e atualiza registros locais (uma emissão ou todas pendentes). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let body: { id?: string } = {};
  try {
    const raw = await request.text();
    if (raw.trim()) body = JSON.parse(raw) as { id?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const apiKey = await obterApiKeyNotaas(supabase, empresaId);
  if (!apiKey) {
    return NextResponse.json(
      { error: "Configure NOTAAS_API_KEY ou a chave da empresa." },
      { status: 503 },
    );
  }

  let query = supabase
    .from("nfse_emissoes")
    .select("id, notaas_invoice_id, status")
    .eq("id_empresa", empresaId)
    .not("notaas_invoice_id", "is", null);

  const id = body.id?.trim();
  if (id) {
    query = query.eq("id", id);
  } else {
    query = query.in("status", ["pendente", "processando", "contingencia"]);
  }

  const { data: rows, error: loadErr } = await query;
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }

  const resultados = [];
  for (const row of rows ?? []) {
    try {
      const r = await sincronizarEmissaoNfse(supabase, empresaId, {
        id: row.id as string,
        notaas_invoice_id: row.notaas_invoice_id as string,
        status: row.status as string,
      });
      resultados.push(r);
    } catch (e) {
      resultados.push({
        id: row.id,
        statusAnterior: row.status,
        statusNovo: row.status,
        alterado: false,
        detalhe: e instanceof Error ? e.message : "Erro ao sincronizar.",
      });
    }
  }

  const alterados = resultados.filter((r) => r.alterado).length;

  return NextResponse.json({
    ok: true,
    total: resultados.length,
    alterados,
    resultados,
  });
}
