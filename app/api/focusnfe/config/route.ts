import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNotaFiscal } from "@/lib/dashboard/nota-fiscal-permissao";
import { baseUrlFocusNfe, labelAmbienteFocus } from "@/lib/focusnfe";
import type { FocusAmbiente } from "@/lib/focusnfe/types";
import {
  CNAE_PADRAO_BELEM,
  CODIGO_SERVICO_PODOLOGIA,
  normalizarCnae,
  normalizarCodigoServicoLc116,
} from "@/lib/notaas/codigo-servico";
import { obterTokenFocusNfe } from "@/lib/focusnfe/config";
import { cifrarSenhaUtf8, deriveMasterKeyFromEnv } from "@/lib/sefaz/nfe/cert-crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET() {
  const session = await getSession();
  const negado = await respostaSeSemPermissaoNotaFiscal(session);
  if (negado) return negado;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("empresa_focusnfe_config")
    .select(
      "ambiente, prestador_cnpj, prestador_inscricao_municipal, prestador_codigo_municipio, item_lista_servico, codigo_cnae, natureza_operacao, regime_especial_tributacao, optante_simples_nacional, iss_retido_padrao, token_cifrado, updated_at",
    )
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let tokenOk = false;
  try {
    tokenOk = Boolean(await obterTokenFocusNfe(supabase, empresaId));
  } catch {
    tokenOk = false;
  }

  const ambiente: FocusAmbiente =
    data?.ambiente === "producao" ? "producao" : "homologacao";

  const itemDb = (data?.item_lista_servico as string | null)?.trim();
  const cnaeDb = (data?.codigo_cnae as string | null)?.trim();

  return NextResponse.json({
    configurado: tokenOk && Boolean(data?.prestador_cnpj),
    tem_token_empresa: Boolean(data?.token_cifrado),
    tem_token_ambiente: Boolean(process.env.FOCUSNFE_TOKEN?.trim()),
    pode_cifrar_token: Boolean(process.env.NFE_CERT_MASTER_KEY?.trim()),
    ambiente,
    base_url: baseUrlFocusNfe(ambiente),
    ambiente_label: labelAmbienteFocus(ambiente),
    prestador_cnpj: data?.prestador_cnpj ?? "",
    prestador_inscricao_municipal: data?.prestador_inscricao_municipal ?? "",
    prestador_codigo_municipio: data?.prestador_codigo_municipio ?? "1501402",
    item_lista_servico:
      normalizarCodigoServicoLc116(itemDb || CODIGO_SERVICO_PODOLOGIA) ??
      CODIGO_SERVICO_PODOLOGIA,
    codigo_cnae: normalizarCnae(cnaeDb || CNAE_PADRAO_BELEM) ?? CNAE_PADRAO_BELEM,
    natureza_operacao: data?.natureza_operacao ?? "1",
    regime_especial_tributacao: data?.regime_especial_tributacao ?? "6",
    optante_simples_nacional: data?.optante_simples_nacional ?? true,
    iss_retido_padrao: data?.iss_retido_padrao ?? false,
    updated_at: data?.updated_at ?? null,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  const negado = await respostaSeSemPermissaoNotaFiscal(session);
  if (negado) return negado;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let body: {
    token?: string | null;
    ambiente?: string;
    prestador_cnpj?: string;
    prestador_inscricao_municipal?: string;
    prestador_codigo_municipio?: string;
    item_lista_servico?: string;
    codigo_cnae?: string;
    natureza_operacao?: string;
    regime_especial_tributacao?: string | null;
    optante_simples_nacional?: boolean;
    iss_retido_padrao?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { id_empresa: empresaId };

  if (typeof body.ambiente === "string") {
    const a = body.ambiente.trim();
    if (a !== "homologacao" && a !== "producao") {
      return NextResponse.json(
        { error: 'Ambiente inválido. Use "homologacao" ou "producao".' },
        { status: 400 },
      );
    }
    patch.ambiente = a;
  }

  if (typeof body.prestador_cnpj === "string") {
    patch.prestador_cnpj = body.prestador_cnpj.replace(/\D/g, "");
  }
  if (typeof body.prestador_inscricao_municipal === "string") {
    patch.prestador_inscricao_municipal = body.prestador_inscricao_municipal.trim();
  }
  if (typeof body.prestador_codigo_municipio === "string") {
    patch.prestador_codigo_municipio = body.prestador_codigo_municipio.replace(/\D/g, "");
  }
  if (typeof body.item_lista_servico === "string") {
    const norm = normalizarCodigoServicoLc116(body.item_lista_servico.trim());
    if (!norm) {
      return NextResponse.json({ error: "Item lista serviço inválido." }, { status: 400 });
    }
    patch.item_lista_servico = norm;
  }
  if (typeof body.codigo_cnae === "string") {
    const norm = normalizarCnae(body.codigo_cnae.trim());
    if (!norm) {
      return NextResponse.json({ error: "CNAE inválido." }, { status: 400 });
    }
    patch.codigo_cnae = norm;
  }
  if (typeof body.natureza_operacao === "string") {
    patch.natureza_operacao = body.natureza_operacao.trim() || "1";
  }
  if (typeof body.regime_especial_tributacao !== "undefined") {
    patch.regime_especial_tributacao = body.regime_especial_tributacao?.trim() || null;
  }
  if (typeof body.optante_simples_nacional === "boolean") {
    patch.optante_simples_nacional = body.optante_simples_nacional;
  }
  if (typeof body.iss_retido_padrao === "boolean") {
    patch.iss_retido_padrao = body.iss_retido_padrao;
  }

  if (typeof body.token !== "undefined") {
    const k = body.token?.trim();
    if (k) {
      try {
        const masterKey = deriveMasterKeyFromEnv();
        patch.token_cifrado = cifrarSenhaUtf8(k, masterKey);
      } catch {
        return NextResponse.json(
          { error: "NFE_CERT_MASTER_KEY ausente — necessária para cifrar o token." },
          { status: 503 },
        );
      }
    } else if (body.token === null || body.token === "") {
      patch.token_cifrado = null;
    }
  }

  const supabase = createAdminClient();
  const { error: upsertErr } = await supabase
    .from("empresa_focusnfe_config")
    .upsert(patch, { onConflict: "id_empresa" });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
