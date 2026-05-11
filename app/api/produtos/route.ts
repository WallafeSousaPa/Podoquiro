import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function optString(v: unknown): string | null {
  if (v === null || typeof v === "undefined") return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function digitsOnly(s: string, len: number): boolean {
  return /^[0-9]+$/.test(s) && s.length === len;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const sessionEmpresaId = parseEmpresaId(session.idEmpresa);
  if (!sessionEmpresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const qEmp = searchParams.get("id_empresa");
  let empresaFilter = sessionEmpresaId;
  if (qEmp !== null && qEmp !== "") {
    const n = Number(qEmp);
    if (Number.isFinite(n) && n > 0) empresaFilter = n;
  }

  const supabase = createAdminClient();
  let query = supabase
    .from("produtos")
    .select("*")
    .eq("id_empresa", empresaFilter);

  const nomeProduto = searchParams.get("produto")?.trim();
  if (nomeProduto) {
    query = query.ilike("produto", `%${nomeProduto}%`);
  }

  const tipo = searchParams.get("tipo");
  if (tipo === "servico") query = query.eq("servico", true);
  else if (tipo === "mercadoria") query = query.eq("servico", false);

  const status = searchParams.get("status");
  if (status === "ativo") query = query.eq("ativo", true);
  else if (status === "inativo") query = query.eq("ativo", false);

  const estOp = searchParams.get("estoque_op");
  const estValRaw = searchParams.get("estoque_val");
  if (
    estOp &&
    estValRaw !== null &&
    estValRaw !== undefined &&
    estValRaw.trim() !== ""
  ) {
    const v = Number(estValRaw.replace(",", "."));
    if (Number.isFinite(v)) {
      const vi = Math.trunc(v);
      if (estOp === "gt") query = query.gt("qtd_estoque", vi);
      else if (estOp === "lt") query = query.lt("qtd_estoque", vi);
      else if (estOp === "eq") query = query.eq("qtd_estoque", vi);
    }
  }

  const { data, error } = await query.order("produto", { ascending: true });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const produto = optString(body.produto);
  if (!produto) {
    return NextResponse.json({ error: "Informe o nome do produto." }, { status: 400 });
  }

  const descricao = optString(body.descricao);
  const un_medida =
    typeof body.un_medida === "string" && body.un_medida.trim()
      ? body.un_medida.trim().slice(0, 10)
      : "UN";

  const precoRaw = body.preco;
  const preco =
    typeof precoRaw === "number"
      ? precoRaw
      : typeof precoRaw === "string"
        ? Number(precoRaw.replace(",", "."))
        : NaN;
  if (!Number.isFinite(preco) || preco < 0) {
    return NextResponse.json({ error: "Preço inválido." }, { status: 400 });
  }

  const qtdRaw = body.qtd_estoque;
  const qtd_estoque =
    typeof qtdRaw === "number"
      ? Math.trunc(qtdRaw)
      : typeof qtdRaw === "string"
        ? Number.parseInt(qtdRaw, 10)
        : 0;
  if (!Number.isFinite(qtd_estoque) || qtd_estoque < 0) {
    return NextResponse.json({ error: "Quantidade em estoque inválida." }, { status: 400 });
  }

  const descontoRaw = body.desconto_padrao;
  const desconto_padrao =
    typeof descontoRaw === "number"
      ? descontoRaw
      : typeof descontoRaw === "string"
        ? Number(descontoRaw.replace(",", "."))
        : 0;
  if (!Number.isFinite(desconto_padrao) || desconto_padrao < 0 || desconto_padrao > 100) {
    return NextResponse.json(
      { error: "Desconto padrão deve ser entre 0 e 100%." },
      { status: 400 },
    );
  }

  let preco_venda: number | null = null;
  if (
    body.preco_venda !== null &&
    typeof body.preco_venda !== "undefined" &&
    body.preco_venda !== ""
  ) {
    const pvRaw = body.preco_venda;
    const pv =
      typeof pvRaw === "number"
        ? pvRaw
        : typeof pvRaw === "string"
          ? Number(pvRaw.replace(",", "."))
          : NaN;
    if (!Number.isFinite(pv) || pv < 0) {
      return NextResponse.json({ error: "Preço de venda promocional inválido." }, { status: 400 });
    }
    preco_venda = pv;
  }

  const ncmRaw =
    typeof body.ncm === "string" ? body.ncm.replace(/\D/g, "").slice(0, 8) : "";
  if (!digitsOnly(ncmRaw, 8)) {
    return NextResponse.json(
      { error: "NCM deve ter exatamente 8 dígitos." },
      { status: 400 },
    );
  }

  let cestVal: string | null = null;
  if (body.cest !== null && typeof body.cest !== "undefined" && body.cest !== "") {
    const cestDigits =
      typeof body.cest === "string" ? body.cest.replace(/\D/g, "").slice(0, 7) : "";
    if (!digitsOnly(cestDigits, 7)) {
      return NextResponse.json(
        { error: "CEST deve ter exatamente 7 dígitos ou ficar em branco." },
        { status: 400 },
      );
    }
    cestVal = cestDigits;
  }

  const origemRaw = body.origem;
  const origem =
    typeof origemRaw === "number"
      ? Math.trunc(origemRaw)
      : typeof origemRaw === "string"
        ? Number.parseInt(origemRaw, 10)
        : 0;
  if (!Number.isFinite(origem) || origem < 0 || origem > 8) {
    return NextResponse.json({ error: "Origem da mercadoria inválida (0–8)." }, { status: 400 });
  }

  const csosnRaw =
    typeof body.csosn === "string" ? body.csosn.replace(/\D/g, "").slice(0, 3) : "";
  if (!digitsOnly(csosnRaw, 3)) {
    return NextResponse.json({ error: "CSOSN deve ter 3 dígitos." }, { status: 400 });
  }

  const cfopRaw =
    typeof body.cfop === "string" ? body.cfop.replace(/\D/g, "").slice(0, 4) : "";
  if (!digitsOnly(cfopRaw, 4)) {
    return NextResponse.json({ error: "CFOP deve ter 4 dígitos." }, { status: 400 });
  }

  const pisRaw =
    typeof body.pis_cst === "string" ? body.pis_cst.replace(/\D/g, "").slice(0, 2) : "07";
  const cofinsRaw =
    typeof body.cofins_cst === "string"
      ? body.cofins_cst.replace(/\D/g, "").slice(0, 2)
      : "07";
  if (!digitsOnly(pisRaw, 2) || !digitsOnly(cofinsRaw, 2)) {
    return NextResponse.json(
      { error: "CST de PIS e COFINS devem ter 2 dígitos." },
      { status: 400 },
    );
  }

  const ativo =
    typeof body.ativo === "boolean" ? body.ativo : true;

  const servico = typeof body.servico === "boolean" ? body.servico : false;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("produtos")
    .insert({
      id_empresa: empresaId,
      produto,
      descricao,
      un_medida,
      preco,
      qtd_estoque,
      desconto_padrao,
      preco_venda,
      ncm: ncmRaw,
      cest: cestVal,
      origem,
      csosn: csosnRaw,
      cfop: cfopRaw,
      pis_cst: pisRaw,
      cofins_cst: cofinsRaw,
      ativo,
      servico,
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Já existe um produto com este SKU nesta empresa." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
