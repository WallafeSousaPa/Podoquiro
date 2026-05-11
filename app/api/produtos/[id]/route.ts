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

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { id: idParam } = await context.params;
  if (!isUuid(idParam)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existe, error: checkErr } = await supabase
    .from("produtos")
    .select("id")
    .eq("id", idParam)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (checkErr) {
    console.error(checkErr);
    return NextResponse.json({ error: checkErr.message }, { status: 500 });
  }
  if (!existe) {
    return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.produto !== "undefined") {
    const produto = optString(body.produto);
    if (!produto) {
      return NextResponse.json({ error: "Nome do produto inválido." }, { status: 400 });
    }
    patch.produto = produto;
  }

  if (typeof body.descricao !== "undefined") {
    patch.descricao = optString(body.descricao);
  }

  if (typeof body.un_medida !== "undefined") {
    const u =
      typeof body.un_medida === "string" && body.un_medida.trim()
        ? body.un_medida.trim().slice(0, 10)
        : "UN";
    patch.un_medida = u;
  }

  if (typeof body.preco !== "undefined") {
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
    patch.preco = preco;
  }

  if (typeof body.qtd_estoque !== "undefined") {
    const qtdRaw = body.qtd_estoque;
    const qtd_estoque =
      typeof qtdRaw === "number"
        ? Math.trunc(qtdRaw)
        : typeof qtdRaw === "string"
          ? Number.parseInt(qtdRaw, 10)
          : NaN;
    if (!Number.isFinite(qtd_estoque) || qtd_estoque < 0) {
      return NextResponse.json({ error: "Quantidade em estoque inválida." }, { status: 400 });
    }
    patch.qtd_estoque = qtd_estoque;
  }

  if (typeof body.desconto_padrao !== "undefined") {
    const descontoRaw = body.desconto_padrao;
    const desconto_padrao =
      typeof descontoRaw === "number"
        ? descontoRaw
        : typeof descontoRaw === "string"
          ? Number(descontoRaw.replace(",", "."))
          : NaN;
    if (
      !Number.isFinite(desconto_padrao) ||
      desconto_padrao < 0 ||
      desconto_padrao > 100
    ) {
      return NextResponse.json(
        { error: "Desconto padrão deve ser entre 0 e 100%." },
        { status: 400 },
      );
    }
    patch.desconto_padrao = desconto_padrao;
  }

  if (typeof body.preco_venda !== "undefined") {
    if (body.preco_venda === null || body.preco_venda === "") {
      patch.preco_venda = null;
    } else {
      const pvRaw = body.preco_venda;
      const pv =
        typeof pvRaw === "number"
          ? pvRaw
          : typeof pvRaw === "string"
            ? Number(pvRaw.replace(",", "."))
            : NaN;
      if (!Number.isFinite(pv) || pv < 0) {
        return NextResponse.json(
          { error: "Preço de venda promocional inválido." },
          { status: 400 },
        );
      }
      patch.preco_venda = pv;
    }
  }

  if (typeof body.ncm !== "undefined") {
    const ncmRaw =
      typeof body.ncm === "string" ? body.ncm.replace(/\D/g, "").slice(0, 8) : "";
    if (!digitsOnly(ncmRaw, 8)) {
      return NextResponse.json(
        { error: "NCM deve ter exatamente 8 dígitos." },
        { status: 400 },
      );
    }
    patch.ncm = ncmRaw;
  }

  if (typeof body.cest !== "undefined") {
    if (body.cest === null || body.cest === "") {
      patch.cest = null;
    } else {
      const cestDigits =
        typeof body.cest === "string" ? body.cest.replace(/\D/g, "").slice(0, 7) : "";
      if (!digitsOnly(cestDigits, 7)) {
        return NextResponse.json(
          { error: "CEST deve ter exatamente 7 dígitos ou ficar em branco." },
          { status: 400 },
        );
      }
      patch.cest = cestDigits;
    }
  }

  if (typeof body.origem !== "undefined") {
    const origemRaw = body.origem;
    const origem =
      typeof origemRaw === "number"
        ? Math.trunc(origemRaw)
        : typeof origemRaw === "string"
          ? Number.parseInt(origemRaw, 10)
          : NaN;
    if (!Number.isFinite(origem) || origem < 0 || origem > 8) {
      return NextResponse.json(
        { error: "Origem da mercadoria inválida (0–8)." },
        { status: 400 },
      );
    }
    patch.origem = origem;
  }

  if (typeof body.csosn !== "undefined") {
    const csosnRaw =
      typeof body.csosn === "string" ? body.csosn.replace(/\D/g, "").slice(0, 3) : "";
    if (!digitsOnly(csosnRaw, 3)) {
      return NextResponse.json({ error: "CSOSN deve ter 3 dígitos." }, { status: 400 });
    }
    patch.csosn = csosnRaw;
  }

  if (typeof body.cfop !== "undefined") {
    const cfopRaw =
      typeof body.cfop === "string" ? body.cfop.replace(/\D/g, "").slice(0, 4) : "";
    if (!digitsOnly(cfopRaw, 4)) {
      return NextResponse.json({ error: "CFOP deve ter 4 dígitos." }, { status: 400 });
    }
    patch.cfop = cfopRaw;
  }

  if (typeof body.pis_cst !== "undefined") {
    const pisRaw =
      typeof body.pis_cst === "string" ? body.pis_cst.replace(/\D/g, "").slice(0, 2) : "";
    if (!digitsOnly(pisRaw, 2)) {
      return NextResponse.json({ error: "CST do PIS deve ter 2 dígitos." }, { status: 400 });
    }
    patch.pis_cst = pisRaw;
  }

  if (typeof body.cofins_cst !== "undefined") {
    const cofinsRaw =
      typeof body.cofins_cst === "string"
        ? body.cofins_cst.replace(/\D/g, "").slice(0, 2)
        : "";
    if (!digitsOnly(cofinsRaw, 2)) {
      return NextResponse.json(
        { error: "CST do COFINS deve ter 2 dígitos." },
        { status: 400 },
      );
    }
    patch.cofins_cst = cofinsRaw;
  }

  if (typeof body.ativo !== "undefined") {
    if (typeof body.ativo !== "boolean") {
      return NextResponse.json({ error: "Campo ativo inválido." }, { status: 400 });
    }
    patch.ativo = body.ativo;
  }

  if (typeof body.servico !== "undefined") {
    if (typeof body.servico !== "boolean") {
      return NextResponse.json({ error: "Campo servico inválido." }, { status: 400 });
    }
    patch.servico = body.servico;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("produtos")
    .update(patch)
    .eq("id", idParam)
    .eq("id_empresa", empresaId)
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
