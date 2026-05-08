import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function proximoNumeroCaixa(numeros: string[]): string {
  let maxNum = 0;
  for (const n of numeros) {
    const d = n.trim();
    if (!/^\d+$/.test(d)) continue;
    const v = Number(d);
    if (Number.isFinite(v) && v > maxNum) maxNum = v;
  }
  return String(maxNum + 1).padStart(2, "0");
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

  let body: { data_referencia?: string; numero_caixa?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const dataRef = typeof body.data_referencia === "string" ? body.data_referencia.trim() : "";
  if (!DATA_RE.test(dataRef)) {
    return NextResponse.json(
      { error: "Informe data_referencia (YYYY-MM-DD)." },
      { status: 400 },
    );
  }

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

  const { data: lancsDia, error: lancsErr } = await supabase
    .from("caixa_lancamentos")
    .select("tipo, numero_caixa")
    .eq("id_empresa", empresaId)
    .eq("data_referencia", dataRef);
  if (lancsErr) {
    console.error(lancsErr);
    return NextResponse.json({ error: lancsErr.message }, { status: 500 });
  }

  const abertos = new Set<string>();
  const fechados = new Set<string>();
  for (const r of lancsDia ?? []) {
    const numero = String(r.numero_caixa ?? "").trim();
    if (!numero) continue;
    if (r.tipo === "abertura") abertos.add(numero);
    if (r.tipo === "fechamento") fechados.add(numero);
  }
  const caixaAberto = [...abertos].find((n) => !fechados.has(n));
  if (caixaAberto) {
    return NextResponse.json(
      { error: `Já existe um caixa aberto nesta data (caixa ${caixaAberto}).` },
      { status: 409 },
    );
  }

  const numeroCaixa = proximoNumeroCaixa(
    (lancsDia ?? []).map((r) => String(r.numero_caixa ?? "")),
  );

  const { data, error } = await supabase
    .from("caixa_lancamentos")
    .insert({
      numero_caixa: numeroCaixa,
      tipo: "abertura",
      id_responsavel: sessionUserId,
      id_empresa: empresaId,
      data_referencia: dataRef,
    })
    .select("id, data_lancamento, numero_caixa, data_referencia")
    .single();

  if (error) {
    console.error(error);
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Não foi possível abrir o próximo caixa desta data." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
