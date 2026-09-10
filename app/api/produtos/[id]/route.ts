import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarMovimentacaoEstoque, registrarHistoricoPrecoVenda } from "@/lib/estoque/registrar-movimentacao-estoque";
import { usuarioPodeEditarPrecoVendaProduto } from "@/lib/dashboard/menus-permissoes";
import {
  parseNumeroNaoNegativo,
  precoVendaPorPercentual,
  roundMoney,
  textoHistoricoPrecoVenda,
} from "@/lib/estoque/preco-venda-produto";
import {
  aplicarPrecoTabelaLoja,
  buscarIdTabelaPrecoEmpresa,
  parsePrecosTabelasBody,
  recalcularPrecosPercentuaisDoProduto,
  salvarPrecosTabelasDoProduto,
} from "@/lib/estoque/tabelas-preco";

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

  const sessionUserId = Number(session.sub);
  const idUsuario =
    Number.isFinite(sessionUserId) && sessionUserId > 0 ? sessionUserId : null;

  const params = await context.params;
  const idParam = decodeURIComponent(String(params?.id ?? "")).trim();
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
  const podePreco = await usuarioPodeEditarPrecoVendaProduto(supabase, idUsuario ?? 0);

  const { data: existe, error: checkErr } = await supabase
    .from("produtos")
    .select("id, id_empresa, servico, qtd_estoque, preco, preco_venda, percentual_sobre_custo")
    .eq("id", idParam)
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

  if (typeof body.percentual_sobre_custo !== "undefined" && podePreco) {
    if (body.percentual_sobre_custo === null || body.percentual_sobre_custo === "") {
      patch.percentual_sobre_custo = null;
    } else {
      const pct = parseNumeroNaoNegativo(body.percentual_sobre_custo);
      if (pct === null) {
        return NextResponse.json(
          { error: "Percentual sobre o custo inválido." },
          { status: 400 },
        );
      }
      patch.percentual_sobre_custo = pct;
    }
  }

  if (typeof body.preco_venda !== "undefined" && podePreco) {
    if (body.preco_venda === null || body.preco_venda === "") {
      patch.preco_venda = null;
    } else {
      const pv = parseNumeroNaoNegativo(body.preco_venda);
      if (pv === null) {
        return NextResponse.json({ error: "Valor de venda inválido." }, { status: 400 });
      }
      patch.preco_venda = pv;
    }
  }

  const pctFinal =
    typeof patch.percentual_sobre_custo !== "undefined"
      ? (patch.percentual_sobre_custo as number | null)
      : existe.percentual_sobre_custo != null
        ? Number(existe.percentual_sobre_custo)
        : null;
  const mudouCusto = typeof patch.preco === "number";
  const mudouPct = typeof patch.percentual_sobre_custo !== "undefined";
  if (
    podePreco &&
    pctFinal != null &&
    Number.isFinite(pctFinal) &&
    (mudouCusto || mudouPct)
  ) {
    const custo =
      typeof patch.preco === "number" ? (patch.preco as number) : Number(existe.preco);
    patch.preco_venda = precoVendaPorPercentual(custo, pctFinal);
    patch.percentual_sobre_custo = pctFinal;
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

  let precosTabelas: ReturnType<typeof parsePrecosTabelasBody> = null;
  try {
    precosTabelas = parsePrecosTabelasBody(body.precos_tabelas);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "precos_tabelas inválido." },
      { status: 400 },
    );
  }

  if (Object.keys(patch).length === 0 && !(podePreco && precosTabelas)) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const empresaProduto = Number(existe.id_empresa);
  const empresaOk =
    Number.isFinite(empresaProduto) && empresaProduto > 0 ? empresaProduto : empresaId;

  let data = existe as Record<string, unknown>;
  if (Object.keys(patch).length > 0) {
    const upd = await supabase
      .from("produtos")
      .update(patch)
      .eq("id", idParam)
      .eq("id_empresa", empresaOk)
      .select()
      .maybeSingle();

    if (upd.error) {
      console.error(upd.error);
      if (upd.error.code === "23505") {
        return NextResponse.json(
          { error: "Já existe um produto com este SKU nesta empresa." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }
    if (!upd.data) {
      return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
    }
    data = upd.data as Record<string, unknown>;
  }

  if (typeof patch.qtd_estoque === "number" && !existe.servico) {
    const saldoAnterior = Number(existe.qtd_estoque);
    const saldoPosterior = patch.qtd_estoque as number;
    const diff = saldoPosterior - saldoAnterior;
    if (diff !== 0) {
      await registrarMovimentacaoEstoque(supabase, {
        id_empresa: empresaOk,
        id_produto: idParam,
        tipo: diff > 0 ? "entrada" : "saida",
        quantidade: Math.abs(diff),
        saldo_anterior: saldoAnterior,
        saldo_posterior: saldoPosterior,
        origem: "ajuste_manual",
        id_usuario: idUsuario,
      });
    }
  }

  const custoFinal =
    typeof patch.preco === "number" ? (patch.preco as number) : Number(existe.preco);
  if (podePreco) {
    try {
      if (precosTabelas && precosTabelas.length > 0) {
        await salvarPrecosTabelasDoProduto(supabase, {
          idProduto: idParam,
          idEmpresa: empresaOk,
          custo: custoFinal,
          itens: precosTabelas,
        });
      } else if (
        typeof patch.preco_venda !== "undefined" ||
        typeof patch.percentual_sobre_custo !== "undefined"
      ) {
        const idTabela = await buscarIdTabelaPrecoEmpresa(supabase, empresaOk);
        if (idTabela) {
          await salvarPrecosTabelasDoProduto(supabase, {
            idProduto: idParam,
            idEmpresa: empresaOk,
            custo: custoFinal,
            itens: [
              {
                id_tabela_preco: idTabela,
                preco_venda:
                  typeof patch.preco_venda !== "undefined"
                    ? patch.preco_venda
                    : existe.preco_venda,
                percentual_sobre_custo:
                  typeof patch.percentual_sobre_custo !== "undefined"
                    ? patch.percentual_sobre_custo
                    : existe.percentual_sobre_custo,
              },
            ],
          });
        }
      } else if (typeof patch.preco === "number") {
        await recalcularPrecosPercentuaisDoProduto(supabase, idParam, custoFinal, empresaOk);
      }
    } catch (tabErr) {
      console.error(tabErr);
      return NextResponse.json(
        {
          error:
            tabErr instanceof Error
              ? tabErr.message
              : "Não foi possível gravar os preços das tabelas.",
        },
        { status: 400 },
      );
    }
  }

  const [enriquecido] = await aplicarPrecoTabelaLoja(
    supabase,
    [data as { id: string; preco_venda?: number | null; percentual_sobre_custo?: number | null }],
    empresaOk,
  );

  const vendaAntes =
    existe.preco_venda != null ? Number(existe.preco_venda) : null;
  const vendaDepois =
    enriquecido?.preco_venda != null ? Number(enriquecido.preco_venda) : vendaAntes;
  const pctAntes =
    existe.percentual_sobre_custo != null ? Number(existe.percentual_sobre_custo) : null;
  const pctDepois =
    enriquecido?.percentual_sobre_custo != null
      ? Number(enriquecido.percentual_sobre_custo)
      : pctAntes;
  const mudouVenda =
    roundMoney(vendaAntes ?? 0) !== roundMoney(vendaDepois ?? 0) ||
    (pctAntes ?? null) !== (pctDepois ?? null);
  if (mudouVenda) {
    try {
      await registrarHistoricoPrecoVenda(supabase, {
        id_empresa: empresaOk,
        id_produto: idParam,
        saldo: Number(data?.qtd_estoque ?? existe.qtd_estoque),
        id_usuario: idUsuario,
        observacao: textoHistoricoPrecoVenda({
          anterior: vendaAntes,
          posterior: vendaDepois,
          percentual: pctDepois,
        }),
      });
    } catch (histErr) {
      console.error(histErr);
    }
  }

  return NextResponse.json({ data: enriquecido ?? data });
}
