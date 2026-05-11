import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  carregarCertificadoEmpresa,
  consultarStatusServicoNfe,
  extrairRetornoStatusServico,
  getConfigNfeGlobal,
  urlNfeStatusServicoSvrs,
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
 * Teste real com a SEFAZ (SVRS): envia consStatServ / status do serviço em nome da empresa da sessão.
 * Grava um registro em `nfe_emissoes` com o retorno (auditoria de teste).
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
  const url = urlNfeStatusServicoSvrs(cfg.ambiente);

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
    /** 107 = serviço em operação (manual NF-e). */
    const servicoOk = parsed.cStat === "107";

    const statusLinha =
      httpStatus === 200 && parsed.cStat && servicoOk
        ? "transmitida"
        : httpStatus === 200 && parsed.cStat
          ? "rejeitada"
          : "rejeitada";

    const motivoFinal =
      parsed.xMotivo ??
      (httpStatus !== 200 ? `HTTP ${httpStatus}` : "Resposta sem retConsStatServ reconhecido.");

    const { data: inserted, error: insErr } = await supabase
      .from("nfe_emissoes")
      .insert({
        id_empresa: empresaId,
        ambiente: cfg.ambiente,
        serie: 1,
        numero_nf: null,
        status: statusLinha,
        chave_acesso: null,
        protocolo_autorizacao: null,
        c_stat: parsed.cStat,
        x_motivo: truncar(motivoFinal, 2000),
        xml_enviado: truncar(envelopeEnviado, 120_000),
        xml_retorno_sefaz: truncar(xmlRetorno, 120_000),
        payload_rascunho: {
          tipo: "teste_status_servico",
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
          debug: {
            httpStatus,
            cStat: parsed.cStat,
            xMotivo: parsed.xMotivo,
          },
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
          ? "SEFAZ respondeu: serviço disponível para uso (teste de status)."
          : motivoFinal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na comunicação com a SEFAZ.";
    try {
      await supabase.from("nfe_emissoes").insert({
        id_empresa: empresaId,
        ambiente: cfg.ambiente,
        serie: 1,
        status: "rejeitada",
        c_stat: null,
        x_motivo: truncar(msg, 2000),
        xml_retorno_sefaz: null,
        payload_rascunho: { tipo: "teste_status_servico_erro", endpoint: url },
      });
    } catch {
      /* ignorar falha secundária */
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
