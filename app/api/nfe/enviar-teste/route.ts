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
  montarNfeXmlMinimaHomologacao,
  normalizarIeNfeEmitente,
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

/**
 * Emite **uma** NF-e de teste em **homologação** (modelo 55, SVRS), lote síncrono.
 * Exige `NFE_AMBIENTE=2`, certificado cadastrado, `NFE_EMITENTE_IE` e empresa com CNPJ (14 dígitos).
 * NCM da linha de teste: `NFE_TESTE_NCM` (8 dígitos) ou padrão TIPI no código.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const cfg = getConfigNfeGlobal();
  if (cfg.ambiente !== 2) {
    return NextResponse.json(
      {
        error:
          "O envio de teste só é permitido em homologação. Defina NFE_AMBIENTE=2 no ambiente do servidor.",
      },
      { status: 400 },
    );
  }

  const ieRaw = process.env.NFE_EMITENTE_IE?.trim();
  if (!ieRaw) {
    return NextResponse.json(
      {
        error:
          "Defina NFE_EMITENTE_IE (IE com 2–14 dígitos, ou **ISENTO** se aplicável) no .env.local.",
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

  const cMun = (process.env.NFE_EMITENTE_CMUN?.trim() || "1501402").replace(/\D/g, "").padStart(7, "0");
  const crt = Number(process.env.NFE_EMITENTE_CRT?.trim() || "1");
  const serie = Math.min(999, Math.max(1, Number(process.env.NFE_SERIE?.trim() || "1") || 1));
  const cpfDest = (process.env.NFE_TESTE_CPF_DEST?.trim() || "11144477735").replace(/\D/g, "").padStart(11, "0");
  const vNF = (process.env.NFE_TESTE_VALOR?.trim() || "1.00").replace(",", ".");
  const ncm8 = process.env.NFE_TESTE_NCM?.trim();

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
      { error: "Cadastre razão social e CNPJ da empresa (Empresas) antes de emitir." },
      { status: 400 },
    );
  }

  const cnpj14 = apenasDigitos(emp.cnpj_cpf as string);
  if (cnpj14.length !== 14) {
    return NextResponse.json(
      { error: "Emissão de teste requer CNPJ com 14 dígitos na empresa." },
      { status: 400 },
    );
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
      {
        error:
          "Certificado não configurado. Cadastre em Parâmetros NF-e ou use NFE_CERT_PATH.",
      },
      { status: 400 },
    );
  }

  const cnpj14Cert = extrairCnpj14DoPfx(material.pfx, material.senha);
  if (!cnpj14Cert) {
    return NextResponse.json(
      {
        error:
          "Não foi possível ler o CNPJ no certificado digital. Use um e-CNPJ ICP-Brasil (PJ) emitido para o mesmo CNPJ da empresa, ou verifique se o PFX está íntegro.",
      },
      { status: 400 },
    );
  }
  const baseEmit = cnpj14.slice(0, 8);
  const baseCert = cnpj14Cert.slice(0, 8);
  if (baseEmit !== baseCert) {
    return NextResponse.json(
      {
        error: `CNPJ-base da empresa (${baseEmit}…) difere do CNPJ-base do certificado (${baseCert}…). Corrija o CNPJ em Empresas ou cadastre o certificado da mesma raiz (rejeição SEFAZ 213).`,
      },
      { status: 400 },
    );
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
    return NextResponse.json({ error: "Número NF excede o limite suportado." }, { status: 400 });
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
    cMun,
    xMun: String(emp.cidade || "NAO INFORMADO").slice(0, 60),
    uf: String(emp.estado || "PA").slice(0, 2).toUpperCase(),
    cep: apenasDigitos(String(emp.cep || "66000000")).padStart(8, "0"),
    fone: null,
  };

  const xmlSemAssinatura = montarNfeXmlMinimaHomologacao({
    emitente,
    chave44,
    serie,
    nNF,
    vNF,
    dhEmi: dhEmiAmericaBelem(),
    cpfDest,
    ncm8,
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
      escopo_emissao: "teste",
      payload_rascunho: { tipo: "envio_teste_erro", endpoint: url },
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
      escopo_emissao: "teste",
      payload_rascunho: {
        tipo: "envio_teste_homolog",
        idLote,
        http_status: httpStatus,
        cStatLote: parsed.cStatLote,
        cStatProt: parsed.cStatProt,
        chNFe: parsed.chNFe,
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
