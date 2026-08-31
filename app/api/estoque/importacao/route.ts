import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaIdDaSessao, parseEmpresaIdValor } from "@/lib/estoque/parse-empresa-id";
import { parseNfeXml } from "@/lib/estoque/parse-nfe-xml";
import { montarPreviewImportacao } from "@/lib/estoque/preview-nfe-importacao";
import type { ProdutoEstoqueMatch } from "@/lib/estoque/vincular-produtos-nfe";

const PROD_SELECT =
  "id, produto, sku, barcode, qtd_estoque, ncm, servico";

async function empresaExiste(
  supabase: ReturnType<typeof createAdminClient>,
  id: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("empresas")
    .select("id")
    .eq("id", id)
    .eq("ativo", true)
    .maybeSingle();
  if (error) {
    console.error(error);
    return false;
  }
  return Boolean(data);
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const sessionEmpresaId = empresaIdDaSessao(session.idEmpresa);
  if (!sessionEmpresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const empresaId =
    parseEmpresaIdValor(searchParams.get("id_empresa")) ?? sessionEmpresaId;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("estoque_nfe_importacoes")
    .select(
      "id, id_empresa, chave_acesso, numero_nf, serie, dh_emissao, emit_nome, emit_cnpj, dest_nome, valor_nf, status, entrada_em, created_at",
    )
    .eq("id_empresa", empresaId)
    .order("created_at", { ascending: false })
    .limit(100);

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

  const sessionEmpresaId = empresaIdDaSessao(session.idEmpresa);
  if (!sessionEmpresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  const idUsuario =
    Number.isFinite(sessionUserId) && sessionUserId > 0 ? sessionUserId : null;

  let body: { xml?: unknown; id_empresa?: unknown };
  try {
    body = (await request.json()) as { xml?: unknown; id_empresa?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const empresaId = parseEmpresaIdValor(body.id_empresa) ?? sessionEmpresaId;

  const xml = typeof body.xml === "string" ? body.xml : "";
  if (!xml.trim()) {
    return NextResponse.json({ error: "Informe o XML da NF-e." }, { status: 400 });
  }
  if (xml.length > 2_000_000) {
    return NextResponse.json({ error: "Arquivo XML muito grande." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseNfeXml(xml);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não foi possível ler o XML.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (!(await empresaExiste(supabase, empresaId))) {
    return NextResponse.json({ error: "Empresa não encontrada ou inativa." }, { status: 400 });
  }

  const { data: existente, error: exErr } = await supabase
    .from("estoque_nfe_importacoes")
    .select("*")
    .eq("id_empresa", empresaId)
    .eq("chave_acesso", parsed.chaveAcesso)
    .maybeSingle();

  if (exErr) {
    console.error(exErr);
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }

  if (existente?.status === "entrada_realizada") {
    return NextResponse.json(
      {
        error: `Esta NF-e (${parsed.numeroNf}) já teve entrada no estoque desta empresa.`,
        id: existente.id,
        ja_importada: true,
      },
      { status: 409 },
    );
  }

  const { data: produtos, error: prodErr } = await supabase
    .from("produtos")
    .select(PROD_SELECT)
    .eq("id_empresa", empresaId)
    .eq("servico", false);

  if (prodErr) {
    console.error(prodErr);
    return NextResponse.json({ error: prodErr.message }, { status: 500 });
  }

  let notaId: string;

  if (existente?.status === "pendente") {
    notaId = existente.id as string;

    const { error: updErr } = await supabase
      .from("estoque_nfe_importacoes")
      .update({
        numero_nf: parsed.numeroNf,
        serie: parsed.serie,
        modelo: parsed.modelo,
        dh_emissao: parsed.dhEmissao,
        natureza_operacao: parsed.naturezaOperacao || null,
        emit_cnpj: parsed.emit.cnpj || null,
        emit_nome: parsed.emit.xNome || null,
        emit_fantasia: parsed.emit.xFant || null,
        emit_ie: parsed.emit.ie || null,
        emit_uf: parsed.emit.uf || null,
        emit_municipio: parsed.emit.xMun || null,
        emit_endereco: parsed.emit.endereco || null,
        emit_fone: parsed.emit.fone || null,
        dest_doc: parsed.dest?.doc || null,
        dest_tipo: parsed.dest?.tipoDoc || null,
        dest_nome: parsed.dest?.xNome || null,
        dest_uf: parsed.dest?.uf || null,
        dest_municipio: parsed.dest?.xMun || null,
        dest_endereco: parsed.dest?.endereco || null,
        dest_email: parsed.dest?.email || null,
        valor_produtos: parsed.totais.vProd,
        valor_frete: parsed.totais.vFrete,
        valor_nf: parsed.totais.vNF,
        xml_original: xml,
        id_usuario: idUsuario,
      })
      .eq("id", notaId)
      .eq("id_empresa", empresaId);

    if (updErr) {
      console.error(updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    const { error: delErr } = await supabase
      .from("estoque_nfe_importacao_itens")
      .delete()
      .eq("id_importacao", notaId);
    if (delErr) {
      console.error(delErr);
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("estoque_nfe_importacoes")
      .insert({
        id_empresa: empresaId,
        chave_acesso: parsed.chaveAcesso,
        numero_nf: parsed.numeroNf,
        serie: parsed.serie,
        modelo: parsed.modelo,
        dh_emissao: parsed.dhEmissao,
        natureza_operacao: parsed.naturezaOperacao || null,
        emit_cnpj: parsed.emit.cnpj || null,
        emit_nome: parsed.emit.xNome || null,
        emit_fantasia: parsed.emit.xFant || null,
        emit_ie: parsed.emit.ie || null,
        emit_uf: parsed.emit.uf || null,
        emit_municipio: parsed.emit.xMun || null,
        emit_endereco: parsed.emit.endereco || null,
        emit_fone: parsed.emit.fone || null,
        dest_doc: parsed.dest?.doc || null,
        dest_tipo: parsed.dest?.tipoDoc || null,
        dest_nome: parsed.dest?.xNome || null,
        dest_uf: parsed.dest?.uf || null,
        dest_municipio: parsed.dest?.xMun || null,
        dest_endereco: parsed.dest?.endereco || null,
        dest_email: parsed.dest?.email || null,
        valor_produtos: parsed.totais.vProd,
        valor_frete: parsed.totais.vFrete,
        valor_nf: parsed.totais.vNF,
        xml_original: xml,
        status: "pendente",
        id_usuario: idUsuario,
      })
      .select("id")
      .single();

    if (insErr) {
      console.error(insErr);
      if (insErr.code === "23505") {
        return NextResponse.json(
          { error: "Esta NF-e já foi importada nesta empresa." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    notaId = inserted.id as string;
  }

  const { error: itensErr } = await supabase.from("estoque_nfe_importacao_itens").insert(
    parsed.itens.map((it) => ({
      id_importacao: notaId,
      n_item: it.nItem,
      c_prod: it.cProd || null,
      c_ean: it.cEan,
      x_prod: it.xProd,
      ncm: it.ncm || null,
      cest: it.cest,
      cfop: it.cfop || null,
      u_com: it.uCom || null,
      q_com: it.qCom,
      v_un_com: it.vUnCom,
      v_prod: it.vProd,
      v_frete: it.vFrete,
      origem: it.origem,
      csosn: it.csosn,
    })),
  );

  if (itensErr) {
    console.error(itensErr);
    return NextResponse.json({ error: itensErr.message }, { status: 500 });
  }

  const { data: nota, error: notaErr } = await supabase
    .from("estoque_nfe_importacoes")
    .select("*")
    .eq("id", notaId)
    .eq("id_empresa", empresaId)
    .single();

  const { data: itens, error: itensGetErr } = await supabase
    .from("estoque_nfe_importacao_itens")
    .select("*")
    .eq("id_importacao", notaId)
    .order("n_item", { ascending: true });

  if (notaErr || itensGetErr || !nota) {
    console.error(notaErr ?? itensGetErr);
    return NextResponse.json(
      { error: (notaErr ?? itensGetErr)?.message ?? "Falha ao recarregar a nota." },
      { status: 500 },
    );
  }

  const preview = montarPreviewImportacao(
    nota,
    itens ?? [],
    (produtos ?? []) as ProdutoEstoqueMatch[],
  );

  return NextResponse.json({ data: preview });
}
