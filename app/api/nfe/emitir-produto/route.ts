import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assinarNfeXml,
  carregarCertificadoEmpresa,
  codigoUfParaNfe,
  enviarLoteNfeSincrono,
  extrairCnpj14DoPfx,
  extrairRetornoAutorizacaoLote,
  gerarCodigoNumericoNfe8,
  getConfigNfeGlobal,
  montarChaveAcessoNfe55,
  montarNfeXmlProdutoNacional,
  normalizarIeNfeEmitente,
  type LinhaProdutoNfe,
  urlNfeAutorizacaoSvrs,
} from "@/lib/sefaz/nfe";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function truncar(s: string, max: number) {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…`;
}

function dhEmiAmericaBelem(d = new Date()): string {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/Belem" });
  return `${s.replace(" ", "T")}-03:00`;
}

function anoMesBelem(d = new Date()): { ano: number; mes: number } {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/Belem" });
  const [y, m] = s.slice(0, 10).split("-").map(Number);
  return { ano: y!, mes: m! };
}

function apenasDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function eanOuSemGtin(barcode: string | null | undefined): string {
  const d = (barcode ?? "").replace(/\D/g, "");
  if (d.length === 8 || d.length === 12 || d.length === 13 || d.length === 14) return d;
  return "SEM GTIN";
}

type BodyItem = { id_produto: string; quantidade?: number };

type BodyDest = {
  cpf?: string;
  cnpj?: string;
  x_nome: string;
  x_lgr: string;
  nro: string;
  x_bairro: string;
  c_mun: string;
  x_mun: string;
  uf: string;
  cep: string;
};

/**
 * Emite NF-e modelo 55 de **mercadoria** (nacional, mesma UF — `idDest=1`), lote síncrono SVRS.
 * Requer certificado, `NFE_EMITENTE_IE`, produtos cadastrados como mercadoria e CPF/CNPJ do destinatário.
 */
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

  const itensRaw = body.itens;
  if (!Array.isArray(itensRaw) || itensRaw.length === 0) {
    return NextResponse.json(
      { error: "Informe ao menos um item com `id_produto` e `quantidade`." },
      { status: 400 },
    );
  }
  if (itensRaw.length > 50) {
    return NextResponse.json({ error: "Limite de 50 itens por nota." }, { status: 400 });
  }

  const destRaw = body.destinatario;
  if (!destRaw || typeof destRaw !== "object") {
    return NextResponse.json({ error: "Informe `destinatario`." }, { status: 400 });
  }
  const dest = destRaw as BodyDest;

  const cpf = dest.cpf ? apenasDigitos(String(dest.cpf)) : "";
  const cnpj = dest.cnpj ? apenasDigitos(String(dest.cnpj)) : "";
  const temCpf = cpf.length > 0;
  const temCnpj = cnpj.length > 0;
  if (temCpf && temCnpj) {
    return NextResponse.json(
      { error: "Informe apenas CPF **ou** CNPJ do destinatário, não os dois." },
      { status: 400 },
    );
  }
  if (!temCpf && !temCnpj) {
    return NextResponse.json({ error: "Informe o CPF ou o CNPJ do destinatário." }, { status: 400 });
  }
  if (temCpf && cpf.length !== 11) {
    return NextResponse.json({ error: "CPF do destinatário deve ter 11 dígitos." }, { status: 400 });
  }
  if (temCnpj && cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ do destinatário deve ter 14 dígitos." }, { status: 400 });
  }

  const xNome = String(dest.x_nome ?? "").trim();
  const xLgr = String(dest.x_lgr ?? "").trim();
  const nro = String(dest.nro ?? "").trim();
  const xBairro = String(dest.x_bairro ?? "").trim();
  const cMun = apenasDigitos(String(dest.c_mun ?? "")).padStart(7, "0");
  const xMun = String(dest.x_mun ?? "").trim();
  const uf = String(dest.uf ?? "").trim().toUpperCase().slice(0, 2);
  const cep = apenasDigitos(String(dest.cep ?? "")).padStart(8, "0");

  if (!xNome || !xLgr || !nro || !xBairro || cMun.length !== 7 || !xMun || uf.length !== 2 || cep.length !== 8) {
    return NextResponse.json(
      { error: "Endereço do destinatário incompleto (logradouro, nº, bairro, município IBGE, UF, CEP)." },
      { status: 400 },
    );
  }

  const natOp = String(body.natureza_operacao ?? "VENDA DE MERCADORIA").trim().slice(0, 60) || "VENDA DE MERCADORIA";

  const cfg = getConfigNfeGlobal();
  const ieRaw = process.env.NFE_EMITENTE_IE?.trim();
  if (!ieRaw) {
    return NextResponse.json(
      {
        error:
          "Defina NFE_EMITENTE_IE (IE ou ISENTO) no .env.local / variáveis do servidor.",
      },
      { status: 400 },
    );
  }
  let ieNormalizado: string;
  try {
    ieNormalizado = normalizarIeNfeEmitente(ieRaw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "IE inválida.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const cMunEmit = (process.env.NFE_EMITENTE_CMUN?.trim() || "1501402").replace(/\D/g, "").padStart(7, "0");
  const crt = Number(process.env.NFE_EMITENTE_CRT?.trim() || "1");
  const serie = Math.min(999, Math.max(1, Number(process.env.NFE_SERIE?.trim() || "1") || 1));

  const supabase = createAdminClient();

  const { data: emp, error: empErr } = await supabase
    .from("empresas")
    .select(
      "razao_social, nome_fantasia, cnpj_cpf, cep, endereco, numero, complemento, bairro, cidade, estado",
    )
    .eq("id", empresaId)
    .maybeSingle();

  if (empErr) {
    console.error(empErr);
    return NextResponse.json({ error: empErr.message }, { status: 500 });
  }
  if (!emp?.razao_social || !emp?.cnpj_cpf) {
    return NextResponse.json(
      { error: "Cadastre razão social e CNPJ da empresa antes de emitir." },
      { status: 400 },
    );
  }

  const cnpj14 = apenasDigitos(emp.cnpj_cpf as string);
  if (cnpj14.length !== 14) {
    return NextResponse.json({ error: "Empresa deve ter CNPJ com 14 dígitos." }, { status: 400 });
  }

  let material;
  try {
    material = await carregarCertificadoEmpresa(supabase, empresaId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Certificado indisponível.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (!material) {
    return NextResponse.json(
      { error: "Certificado não configurado. Cadastre em Parâmetros NF-e." },
      { status: 400 },
    );
  }

  const cnpj14Cert = extrairCnpj14DoPfx(material.pfx, material.senha);
  if (!cnpj14Cert) {
    return NextResponse.json(
      {
        error:
          "Não foi possível ler o CNPJ no certificado. Use e-CNPJ ICP-Brasil da mesma empresa.",
      },
      { status: 400 },
    );
  }
  if (cnpj14.slice(0, 8) !== cnpj14Cert.slice(0, 8)) {
    return NextResponse.json(
      {
        error: `CNPJ-base da empresa difere do certificado (rejeição 213).`,
      },
      { status: 400 },
    );
  }

  const ids: string[] = [];
  const qtdPorId = new Map<string, number>();
  for (const row of itensRaw) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as BodyItem).id_produto ?? "").trim();
    const q = Number((row as BodyItem).quantidade ?? 1);
    if (!id) {
      return NextResponse.json({ error: "Cada item deve ter `id_produto` (UUID)." }, { status: 400 });
    }
    if (!Number.isFinite(q) || q <= 0 || q > 999_999) {
      return NextResponse.json({ error: `Quantidade inválida para o produto ${id}.` }, { status: 400 });
    }
    ids.push(id);
    qtdPorId.set(id, (qtdPorId.get(id) ?? 0) + q);
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: "Nenhum item válido." }, { status: 400 });
  }

  const { data: prows, error: pErr } = await supabase
    .from("produtos")
    .select(
      "id, sku, barcode, produto, un_medida, preco, preco_venda, ncm, origem, csosn, cfop, pis_cst, cofins_cst, servico, id_empresa",
    )
    .eq("id_empresa", empresaId)
    .eq("ativo", true)
    .eq("servico", false)
    .in("id", [...new Set(ids)]);

  if (pErr) {
    console.error(pErr);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const prodMap = new Map((prows ?? []).map((p) => [p.id as string, p]));
  const linhas: LinhaProdutoNfe[] = [];
  const uniqueIds = [...new Set(ids)];

  for (const id of uniqueIds) {
    const p = prodMap.get(id);
    if (!p) {
      return NextResponse.json(
        { error: `Produto ${id} não encontrado, inativo ou não é mercadoria.` },
        { status: 400 },
      );
    }
    const qCom = qtdPorId.get(id) ?? 0;
    const precoBase =
      p.preco_venda != null && Number(p.preco_venda) >= 0
        ? Number(p.preco_venda)
        : Number(p.preco);
    const vProd = roundMoney(qCom * precoBase);
    const cProd = (p.sku && String(p.sku).trim()) || id.slice(0, 8);
    linhas.push({
      cProd: String(cProd).slice(0, 60),
      cEAN: eanOuSemGtin(p.barcode ? String(p.barcode) : null),
      xProd: String(p.produto).slice(0, 120),
      ncm: String(p.ncm).replace(/\D/g, "").padStart(8, "0"),
      cfop: String(p.cfop ?? "5102").replace(/\D/g, "").padStart(4, "0"),
      uCom: (p.un_medida && String(p.un_medida).trim()) || "UN",
      qCom,
      vUnCom: precoBase,
      vProd,
      orig: Math.min(8, Math.max(0, Number(p.origem) || 0)),
      csosn: String(p.csosn ?? "102").replace(/\D/g, "").padStart(3, "0").slice(0, 3),
      pisCst: String(p.pis_cst ?? "07").replace(/\D/g, "").padStart(2, "0").slice(0, 2),
      cofinsCst: String(p.cofins_cst ?? "07").replace(/\D/g, "").padStart(2, "0").slice(0, 2),
    });
  }

  const { data: maxRow } = await supabase
    .from("nfe_emissoes")
    .select("numero_nf")
    .eq("id_empresa", empresaId)
    .eq("serie", serie)
    .not("numero_nf", "is", null)
    .order("numero_nf", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nNF = (typeof maxRow?.numero_nf === "number" ? maxRow.numero_nf : 0) + 1;
  if (nNF > 999_999_999) {
    return NextResponse.json({ error: "Número NF excede o limite." }, { status: 400 });
  }

  const cUF = codigoUfParaNfe(cfg.ufEmitente);
  const { ano, mes } = anoMesBelem();
  const cNF = gerarCodigoNumericoNfe8();
  const chave44 = montarChaveAcessoNfe55({
    cUF,
    ano,
    mes,
    cnpj14,
    mod: 55,
    serie,
    numeroNf: nNF,
    tpEmis: 1,
    codigoNumerico8: cNF,
  });

  const emitente = {
    cnpj14,
    razaoSocial: String(emp.razao_social),
    nomeFantasia: emp.nome_fantasia ? String(emp.nome_fantasia) : undefined,
    ie: ieNormalizado,
    crt,
    logradouro: String(emp.endereco || "NAO INFORMADO").slice(0, 60),
    nro: String(emp.numero || "S/N").slice(0, 60),
    complemento: emp.complemento ? String(emp.complemento) : null,
    bairro: String(emp.bairro || "CENTRO").slice(0, 60),
    cMun: cMunEmit,
    xMun: String(emp.cidade || "NAO INFORMADO").slice(0, 60),
    uf: String(emp.estado || "PA").slice(0, 2).toUpperCase(),
    cep: apenasDigitos(String(emp.cep || "66000000")).padStart(8, "0"),
    fone: null,
  };

  if (uf !== emitente.uf) {
    return NextResponse.json(
      {
        error:
          "Nesta versão a NF de produto é só **nacional na mesma UF** do emitente. UF do destinatário deve ser igual à da empresa.",
      },
      { status: 400 },
    );
  }

  const xmlSemAssinatura = montarNfeXmlProdutoNacional({
    emitente,
    chave44,
    serie,
    nNF,
    dhEmi: dhEmiAmericaBelem(),
    tpAmb: cfg.ambiente,
    natOp,
    idDest: 1,
    linhas,
    dest: {
      cpf11: cnpj ? undefined : cpf,
      cnpj14: cnpj || undefined,
      xNome,
      xLgr,
      nro,
      xBairro: xBairro,
      cMun,
      xMun,
      UF: uf,
      CEP: cep,
    },
  });

  let xmlAssinado: string;
  try {
    xmlAssinado = assinarNfeXml(xmlSemAssinatura, material.pfx, material.senha);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao assinar o XML.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const idLote = String(Date.now()).replace(/\D/g, "").slice(-15);
  const url = urlNfeAutorizacaoSvrs(cfg.ambiente);

  let httpStatus: number;
  let xmlRetorno: string;
  let envelopeEnviado: string;
  try {
    const r = await enviarLoteNfeSincrono({
      urlEndpoint: url,
      versaoLayout: "4.00",
      idLote,
      xmlNFeSemDeclaracao: xmlAssinado,
      pfx: material.pfx,
      senhaCertificado: material.senha,
    });
    httpStatus = r.httpStatus;
    xmlRetorno = r.xmlRetorno;
    envelopeEnviado = r.envelopeEnviado;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na comunicação com a SEFAZ.";
    await supabase.from("nfe_emissoes").insert({
      id_empresa: empresaId,
      ambiente: cfg.ambiente,
      serie,
      numero_nf: nNF,
      status: "rejeitada",
      chave_acesso: chave44,
      c_stat: null,
      x_motivo: truncar(msg, 2000),
      xml_enviado: truncar(xmlAssinado, 120_000),
      escopo_emissao: "produto",
      payload_rascunho: { tipo: "emitir_produto_erro", endpoint: url, itens: uniqueIds },
    });
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const parsed = extrairRetornoAutorizacaoLote(xmlRetorno);
  const autorizada = parsed.cStatProt === "100";
  const statusLinha = autorizada ? "autorizada" : "rejeitada";
  const cStatFinal = parsed.cStatProt ?? parsed.cStatLote;
  const xMotivoFinal =
    parsed.xMotivoProt ??
    parsed.xMotivoLote ??
    (httpStatus !== 200 ? `HTTP ${httpStatus}` : "Sem retorno interpretável.");

  const { data: inserted, error: insErr } = await supabase
    .from("nfe_emissoes")
    .insert({
      id_empresa: empresaId,
      ambiente: cfg.ambiente,
      serie,
      numero_nf: nNF,
      status: statusLinha,
      chave_acesso: chave44,
      protocolo_autorizacao: parsed.nProt,
      c_stat: cStatFinal,
      x_motivo: truncar(xMotivoFinal, 2000),
      xml_enviado: truncar(envelopeEnviado + "\n---NFe---\n" + xmlAssinado, 120_000),
      xml_retorno_sefaz: truncar(xmlRetorno, 120_000),
      escopo_emissao: "produto",
      payload_rascunho: {
        tipo: "emitir_produto",
        idLote,
        http_status: httpStatus,
        cStatLote: parsed.cStatLote,
        cStatProt: parsed.cStatProt,
        chNFe: parsed.chNFe,
        natureza_operacao: natOp,
        destinatario: { cpf: cpf || null, cnpj: cnpj || null },
        itens: [...qtdPorId.entries()].map(([id_produto, quantidade]) => ({
          id_produto,
          quantidade,
        })),
      },
    })
    .select("id")
    .single();

  if (insErr) {
    console.error(insErr);
    return NextResponse.json(
      {
        error: insErr.message,
        debug: { cStatLote: parsed.cStatLote, cStatProt: parsed.cStatProt },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: autorizada && httpStatus === 200,
    idRegistro: inserted?.id,
    chave: chave44,
    nNF,
    serie,
    httpStatus,
    cStatLote: parsed.cStatLote,
    cStatProt: parsed.cStatProt,
    xMotivo: xMotivoFinal,
    protocolo: parsed.nProt,
  });
}
