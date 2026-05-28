import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { cifrarSenhaUtf8, deriveMasterKeyFromEnv } from "@/lib/sefaz/nfe/cert-crypto";
import {
  avisoFusoHorarioEmissaoNfse,
  CNAE_PADRAO_BELEM,
  CODIGO_SERVICO_PODOLOGIA,
  normalizarCodigoServicoLc116,
  normalizarCnae,
  obterApiKeyNotaas,
  sincronizarProjetoNotaas,
  validarProjetoNotaas,
} from "@/lib/notaas";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("empresa_notaas_config")
    .select(
      "codigo_servico_padrao, cnae_padrao, aliquota_iss_padrao, iss_retido_padrao, api_key_cifrada, updated_at",
    )
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let apiKeyOk = false;
  try {
    apiKeyOk = Boolean(await obterApiKeyNotaas(supabase, empresaId));
  } catch {
    apiKeyOk = false;
  }

  const codigoDb = (data?.codigo_servico_padrao as string | null)?.trim();
  const codigoEnv = process.env.NOTAAS_CODIGO_SERVICO?.trim() || CODIGO_SERVICO_PODOLOGIA;
  const cnaeDb = (data?.cnae_padrao as string | null)?.trim();
  const cnaeEnv = process.env.NOTAAS_CNAE?.trim() || CNAE_PADRAO_BELEM;
  const aliqEnv = process.env.NOTAAS_ALIQUOTA_ISS?.trim();
  const podeCifrarApiKey = Boolean(process.env.NFE_CERT_MASTER_KEY?.trim());

  const codigoNorm =
    normalizarCodigoServicoLc116(codigoDb || codigoEnv) ?? CODIGO_SERVICO_PODOLOGIA;
  const cnaeNorm = normalizarCnae(cnaeDb || cnaeEnv);
  const validacaoProjeto = cnaeNorm
    ? await validarProjetoNotaas({
        codigoMunicipio: "1501402",
        codigoTributacao: codigoNorm,
        cnae: cnaeNorm,
      })
    : null;

  const avisoFuso = avisoFusoHorarioEmissaoNfse();

  return NextResponse.json({
    configurado: apiKeyOk,
    emissao_bloqueada_fuso: avisoFuso.bloqueada,
    emissao_bloqueada_motivo: avisoFuso.mensagem,
    data_brasil: avisoFuso.dataBrasil,
    data_utc: avisoFuso.dataUtc,
    tem_api_key_empresa: Boolean(data?.api_key_cifrada),
    tem_api_key_ambiente: Boolean(process.env.NOTAAS_API_KEY?.trim()),
    pode_cifrar_api_key: podeCifrarApiKey,
    codigo_servico_padrao: codigoNorm,
    cnae_padrao: cnaeNorm,
    aliquota_iss_padrao:
      data?.aliquota_iss_padrao != null
        ? Number(data.aliquota_iss_padrao)
        : aliqEnv
          ? Number(aliqEnv.replace(",", "."))
          : 2,
    iss_retido_padrao: Boolean(data?.iss_retido_padrao),
    updated_at: data?.updated_at ?? null,
    validacao_projeto: validacaoProjeto,
  });
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

  let body: {
    api_key?: string | null;
    codigo_servico_padrao?: string | null;
    cnae_padrao?: string | null;
    aliquota_iss_padrao?: number | null;
    iss_retido_padrao?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existente } = await supabase
    .from("empresa_notaas_config")
    .select("codigo_servico_padrao, cnae_padrao")
    .eq("id_empresa", empresaId)
    .maybeSingle();

  const patch: Record<string, unknown> = {};

  if (typeof body.codigo_servico_padrao !== "undefined") {
    const raw = body.codigo_servico_padrao?.trim() || null;
    if (raw) {
      const norm = normalizarCodigoServicoLc116(raw);
      if (!norm) {
        return NextResponse.json(
          {
            error:
              'Código inválido. Belém/podologia: use "060101" ou "06.01".',
          },
          { status: 400 },
        );
      }
      patch.codigo_servico_padrao = norm;
    } else {
      patch.codigo_servico_padrao = null;
    }
  }
  if (typeof body.cnae_padrao !== "undefined") {
    const raw = body.cnae_padrao?.trim() || null;
    if (raw) {
      const norm = normalizarCnae(raw);
      if (!norm) {
        return NextResponse.json(
          { error: 'CNAE inválido. Exemplo válido: "869090400" (9 dígitos).' },
          { status: 400 },
        );
      }
      patch.cnae_padrao = norm;
    } else {
      patch.cnae_padrao = null;
    }
  }
  if (typeof body.aliquota_iss_padrao !== "undefined") {
    const a = body.aliquota_iss_padrao;
    patch.aliquota_iss_padrao =
      a != null && Number.isFinite(Number(a)) ? Number(a) : null;
  }
  if (typeof body.iss_retido_padrao === "boolean") {
    patch.iss_retido_padrao = body.iss_retido_padrao;
  }

  if (typeof body.api_key !== "undefined") {
    const k = body.api_key?.trim();
    if (k) {
      try {
        const masterKey = deriveMasterKeyFromEnv();
        patch.api_key_cifrada = cifrarSenhaUtf8(k, masterKey);
      } catch {
        return NextResponse.json(
          { error: "NFE_CERT_MASTER_KEY ausente — necessária para cifrar a API key." },
          { status: 503 },
        );
      }
    } else if (body.api_key === null || body.api_key === "") {
      patch.api_key_cifrada = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para salvar." }, { status: 400 });
  }

  const { error: upsertErr } = await supabase.from("empresa_notaas_config").upsert(
    {
      id_empresa: empresaId,
      ...patch,
    },
    { onConflict: "id_empresa" },
  );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  let syncNotaas: Awaited<ReturnType<typeof sincronizarProjetoNotaas>> | null = null;
  const codigoEnv = process.env.NOTAAS_CODIGO_SERVICO?.trim() || CODIGO_SERVICO_PODOLOGIA;
  const cnaeEnv = process.env.NOTAAS_CNAE?.trim() || CNAE_PADRAO_BELEM;
  const codigoSync =
    (typeof patch.codigo_servico_padrao === "string"
      ? patch.codigo_servico_padrao
      : normalizarCodigoServicoLc116(
          (existente?.codigo_servico_padrao as string | null)?.trim() || codigoEnv,
        )) ?? CODIGO_SERVICO_PODOLOGIA;
  const cnaeSync =
    (typeof patch.cnae_padrao === "string"
      ? patch.cnae_padrao
      : normalizarCnae((existente?.cnae_padrao as string | null)?.trim() || cnaeEnv)) ??
    null;
  if (cnaeSync && codigoSync) {
    syncNotaas = await sincronizarProjetoNotaas({
      cnae: cnaeSync,
      codigoTributacao: codigoSync,
    });
  }

  return NextResponse.json({
    ok: true,
    sync_notaas_projeto: syncNotaas,
  });
}
