import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  carregarCertificadoEmpresa,
  consultarStatusServicoNfe,
  extrairRetornoStatusServico,
  getConfigNfeGlobal,
  urlNfceStatusServicoSvrs,
} from "@/lib/sefaz/nfe";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function truncar(s: string, max: number) {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…`;
}

/**
 * Teste real de **Status do Serviço da NFC-e** (SVRS-NFCe): envia `consStatServ` em nome da
 * empresa da sessão e grava o retorno em `nfe_emissoes` (modelo 65, escopo teste).
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
  const supabase = createAdminClient();
  const url = urlNfceStatusServicoSvrs(cfg.ambiente);

  let material: Awaited<ReturnType<typeof carregarCertificadoEmpresa>>;
  try {
    material = await carregarCertificadoEmpresa(supabase, empresaId);
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Não foi possível carregar o certificado cifrado.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!material) {
    return NextResponse.json(
      {
        error:
          "Certificado não configurado. Cadastre em Financeiro › Nota Fiscal › Parâmetros ou use NFE_CERT_PATH.",
      },
      { status: 400 },
    );
  }

  try {
    const { envelopeEnviado, httpStatus, xmlRetorno } = await consultarStatusServicoNfe({
      urlEndpoint: url,
      tpAmb: cfg.ambiente,
      ufEmitente: cfg.ufEmitente,
      pfx: material.pfx,
      senhaCertificado: material.senha,
    });

    const parsed = extrairRetornoStatusServico(xmlRetorno);
    /** 107 = serviço em operação (manual NF-e/NFC-e). */
    const servicoOk = parsed.cStat === "107";

    const statusLinha =
      httpStatus === 200 && parsed.cStat && servicoOk ? "transmitida" : "rejeitada";

    const motivoFinal =
      parsed.xMotivo ??
      (httpStatus !== 200 ? `HTTP ${httpStatus}` : "Resposta sem retConsStatServ reconhecido.");

    const { data: inserted, error: insErr } = await supabase
      .from("nfe_emissoes")
      .insert({
        id_empresa: empresaId,
        ambiente: cfg.ambiente,
        modelo: 65,
        serie: 1,
        numero_nf: null,
        status: statusLinha,
        chave_acesso: null,
        protocolo_autorizacao: null,
        c_stat: parsed.cStat,
        x_motivo: truncar(motivoFinal, 2000),
        xml_enviado: truncar(envelopeEnviado, 120_000),
        xml_retorno_sefaz: truncar(xmlRetorno, 120_000),
        escopo_emissao: "teste",
        payload_rascunho: {
          tipo: "teste_status_servico_nfce",
          endpoint: url,
          http_status: httpStatus,
          dh_resp: parsed.dhResp ?? null,
        },
      })
      .select("id")
      .single();

    if (insErr) {
      console.error(insErr);
      return NextResponse.json(
        {
          error: insErr.message,
          debug: { httpStatus, cStat: parsed.cStat, xMotivo: parsed.xMotivo },
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: servicoOk && httpStatus === 200,
      idRegistro: inserted?.id,
      httpStatus,
      cStat: parsed.cStat,
      xMotivo: parsed.xMotivo,
      mensagem:
        servicoOk && httpStatus === 200
          ? "SEFAZ-NFCe respondeu: serviço disponível para uso (teste de status)."
          : motivoFinal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na comunicação com a SEFAZ.";
    try {
      await supabase.from("nfe_emissoes").insert({
        id_empresa: empresaId,
        ambiente: cfg.ambiente,
        modelo: 65,
        serie: 1,
        status: "rejeitada",
        c_stat: null,
        x_motivo: truncar(msg, 2000),
        xml_retorno_sefaz: null,
        escopo_emissao: "teste",
        payload_rascunho: { tipo: "teste_status_servico_nfce_erro", endpoint: url },
      });
    } catch {
      /* ignorar falha secundária */
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
