import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUsuarioPodeCancelarSaidaEstoque } from "@/lib/dashboard/menu-grupo";
import { empresaIdDaSessao } from "@/lib/estoque/parse-empresa-id";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cancelamentoFoiRegistrado,
  carregarCertificadoEmpresa,
  enviarCancelamentoNfe,
  extrairRetornoCancelamento,
  normalizarJustificativaCancelamento,
  urlNfeRecepcaoEventoSvrs,
  urlNfceRecepcaoEventoSvrs,
} from "@/lib/sefaz/nfe";

function truncar(s: string, max: number) {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…`;
}

type Body = {
  id?: string;
  justificativa?: string;
};

/**
 * Cancela NF-e (mod. 55) ou NFC-e (mod. 65) autorizada na SEFAZ (evento 110111)
 * e libera a saída de venda para nova emissão, se houver vínculo.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const empresaId = empresaIdDaSessao(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const podeCancelar = await getUsuarioPodeCancelarSaidaEstoque(
    supabase,
    Number(session.sub),
  );
  if (!podeCancelar) {
    return NextResponse.json(
      { error: "Somente Administrador ou Diretoria pode cancelar a nota." },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const id = body.id?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "Informe o id da emissão." }, { status: 400 });
  }

  const justificativa = normalizarJustificativaCancelamento(String(body.justificativa ?? ""));
  if (justificativa.length < 15) {
    return NextResponse.json(
      { error: "A justificativa do cancelamento deve ter no mínimo 15 caracteres." },
      { status: 400 },
    );
  }
  if (justificativa.length > 255) {
    return NextResponse.json(
      { error: "A justificativa do cancelamento deve ter no máximo 255 caracteres." },
      { status: 400 },
    );
  }

  const { data: emissao, error } = await supabase
    .from("nfe_emissoes")
    .select(
      "id, ambiente, modelo, status, chave_acesso, protocolo_autorizacao, payload_rascunho",
    )
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!emissao) {
    return NextResponse.json({ error: "Emissão não encontrada." }, { status: 404 });
  }
  if (emissao.status === "cancelada") {
    return NextResponse.json({ error: "Esta nota já está cancelada." }, { status: 409 });
  }
  if (emissao.status !== "autorizada") {
    return NextResponse.json(
      { error: "Somente nota autorizada pode ser cancelada na SEFAZ." },
      { status: 409 },
    );
  }

  const chave = String(emissao.chave_acesso ?? "").replace(/\D/g, "");
  const protocolo = String(emissao.protocolo_autorizacao ?? "").trim();
  if (chave.length !== 44) {
    return NextResponse.json({ error: "A emissão não tem chave de acesso válida." }, { status: 400 });
  }
  if (!protocolo) {
    return NextResponse.json(
      { error: "A emissão não tem protocolo de autorização. Não é possível cancelar." },
      { status: 400 },
    );
  }

  const material = await carregarCertificadoEmpresa(supabase, empresaId);
  if (!material) {
    return NextResponse.json(
      { error: "Certificado digital da empresa não encontrado." },
      { status: 400 },
    );
  }

  const tpAmb = (emissao.ambiente === 1 ? 1 : 2) as 1 | 2;
  const url =
    emissao.modelo === 65
      ? urlNfceRecepcaoEventoSvrs(tpAmb)
      : urlNfeRecepcaoEventoSvrs(tpAmb);

  let httpStatus: number;
  let xmlRetorno: string;
  let envelopeEnviado: string;
  try {
    const r = await enviarCancelamentoNfe({
      urlEndpoint: url,
      chave44: chave,
      protocoloAutorizacao: protocolo,
      tpAmb,
      pfx: material.pfx,
      senhaCertificado: material.senha,
      justificativa,
    });
    httpStatus = r.httpStatus;
    xmlRetorno = r.xmlRetorno;
    envelopeEnviado = r.envelopeEnviado;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na comunicação com a SEFAZ.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const parsed = extrairRetornoCancelamento(xmlRetorno);
  const cStat = parsed.cStat ?? parsed.cStatLote;
  const xMotivo =
    parsed.xMotivo ??
    parsed.xMotivoLote ??
    (httpStatus !== 200 ? `HTTP ${httpStatus}` : "Sem retorno interpretável da SEFAZ.");
  const ok = cancelamentoFoiRegistrado(parsed.cStat);

  const prevPayload =
    emissao.payload_rascunho && typeof emissao.payload_rascunho === "object"
      ? (emissao.payload_rascunho as Record<string, unknown>)
      : {};

  const { error: upErr } = await supabase
    .from("nfe_emissoes")
    .update({
      status: ok ? "cancelada" : emissao.status,
      c_stat: cStat,
      x_motivo: truncar(xMotivo, 2000),
      payload_rascunho: {
        ...prevPayload,
        cancelamento: {
          justificativa,
          http_status: httpStatus,
          cStatLote: parsed.cStatLote,
          cStat: parsed.cStat,
          xMotivo,
          nProt: parsed.nProt,
          xml_retorno: truncar(xmlRetorno, 40_000),
          xml_enviado: truncar(envelopeEnviado, 40_000),
        },
      },
    })
    .eq("id", emissao.id);

  if (upErr) {
    console.error(upErr);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  if (ok) {
    const { error: saidaErr } = await supabase
      .from("estoque_saidas")
      .update({ nota_venda_status: "pronta" })
      .eq("id_nfe_emissao", emissao.id)
      .eq("nota_venda_status", "gerada");
    if (saidaErr) console.error(saidaErr);
  }

  if (!ok) {
    return NextResponse.json(
      {
        error: xMotivo,
        cStat,
        protocolo: parsed.nProt,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: emissao.id,
    chave,
    cStat,
    xMotivo,
    protocolo: parsed.nProt,
    ambiente: tpAmb,
  });
}
