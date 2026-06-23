import type { SupabaseClient } from "@supabase/supabase-js";
import { FocusNfeApiError, focusConsultarNfse } from "./client";
import { obterConfigFocusNfe, obterTokenFocusNfe } from "./config";
import { statusInternoDeFocus } from "./montar-payload";
import type { FocusNfseRespostaConsulta } from "./types";
import { mensagemErroFocusNfse } from "./mensagem-erro";

/** Campos da emissão usados como fallback ao montar o patch de atualização. */
export type EmissaoFocusParcial = {
  id: string;
  id_empresa: number;
  focus_ref: string;
  status: string;
  numero_rps?: string | null;
  serie_rps?: string | null;
  tipo_rps?: string | null;
  numero_nfse?: string | null;
  codigo_verificacao?: string | null;
  url_danfse?: string | null;
  caminho_xml_nota_fiscal?: string | null;
};

/**
 * Monta o patch de atualização de `nfse_focus_emissoes` a partir da consulta Focus,
 * preservando os valores atuais quando a Focus não retornar o campo.
 */
export function montarPatchEmissaoFocus(
  emissao: EmissaoFocusParcial,
  consulta: FocusNfseRespostaConsulta,
): Record<string, unknown> {
  const statusFocus = consulta.status ?? emissao.status;
  const interno = statusInternoDeFocus(statusFocus);
  return {
    status: statusFocus,
    numero_rps: consulta.numero_rps ?? emissao.numero_rps ?? null,
    serie_rps: consulta.serie_rps ?? emissao.serie_rps ?? null,
    tipo_rps: consulta.tipo_rps ?? emissao.tipo_rps ?? null,
    numero_nfse: consulta.numero ?? emissao.numero_nfse ?? null,
    codigo_verificacao: consulta.codigo_verificacao ?? emissao.codigo_verificacao ?? null,
    url_danfse: consulta.url_danfse ?? consulta.url ?? emissao.url_danfse ?? null,
    caminho_xml_nota_fiscal:
      consulta.caminho_xml_nota_fiscal ?? emissao.caminho_xml_nota_fiscal ?? null,
    payload_resposta: consulta,
    error_message:
      interno === "erro"
        ? (mensagemErroFocusNfse(consulta) ?? consulta.mensagem ?? null)
        : null,
    emitted_at: interno === "autorizado" ? new Date().toISOString() : null,
  };
}

export type ResultadoSincronizacao = {
  ok: boolean;
  emissao_id: string;
  status_focus: string;
  status_interno: string;
  consulta?: FocusNfseRespostaConsulta;
  error?: string;
};

/**
 * Reconsulta a NFS-e na Focus pela `ref` e atualiza a emissão local.
 * Usada tanto pela tela "Consultar" quanto pelo webhook (gatilho) da Focus.
 */
export async function sincronizarEmissaoFocus(
  supabase: SupabaseClient,
  emissao: EmissaoFocusParcial,
): Promise<ResultadoSincronizacao> {
  const config = await obterConfigFocusNfe(supabase, emissao.id_empresa);
  if (!config) {
    return {
      ok: false,
      emissao_id: emissao.id,
      status_focus: emissao.status,
      status_interno: statusInternoDeFocus(emissao.status),
      error: "Focus NFe não configurado para a empresa.",
    };
  }

  const token = await obterTokenFocusNfe(supabase, emissao.id_empresa);
  if (!token) {
    return {
      ok: false,
      emissao_id: emissao.id,
      status_focus: emissao.status,
      status_interno: statusInternoDeFocus(emissao.status),
      error: "Token Focus NFe não configurado para a empresa.",
    };
  }

  let consulta: FocusNfseRespostaConsulta;
  try {
    consulta = await focusConsultarNfse(config.baseUrl, token, emissao.focus_ref);
  } catch (e) {
    const msg =
      e instanceof FocusNfeApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Falha ao consultar a Focus NFe.";
    return {
      ok: false,
      emissao_id: emissao.id,
      status_focus: emissao.status,
      status_interno: statusInternoDeFocus(emissao.status),
      error: msg,
    };
  }

  const patch = montarPatchEmissaoFocus(emissao, consulta);
  const { error: upErr } = await supabase
    .from("nfse_focus_emissoes")
    .update(patch)
    .eq("id", emissao.id);

  if (upErr) {
    return {
      ok: false,
      emissao_id: emissao.id,
      status_focus: (consulta.status ?? emissao.status) as string,
      status_interno: statusInternoDeFocus(consulta.status ?? emissao.status),
      consulta,
      error: upErr.message,
    };
  }

  const statusFocus = (consulta.status ?? emissao.status) as string;
  return {
    ok: true,
    emissao_id: emissao.id,
    status_focus: statusFocus,
    status_interno: statusInternoDeFocus(statusFocus),
    consulta,
  };
}

/** Localiza a emissão pela `focus_ref` e sincroniza. Retorna null se não existir. */
export async function sincronizarEmissaoFocusPorRef(
  supabase: SupabaseClient,
  focusRef: string,
): Promise<{ emissao: EmissaoFocusParcial; resultado: ResultadoSincronizacao } | null> {
  const { data, error } = await supabase
    .from("nfse_focus_emissoes")
    .select(
      "id, id_empresa, focus_ref, status, numero_rps, serie_rps, tipo_rps, numero_nfse, codigo_verificacao, url_danfse, caminho_xml_nota_fiscal",
    )
    .eq("focus_ref", focusRef)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const emissao = data as EmissaoFocusParcial;
  const resultado = await sincronizarEmissaoFocus(supabase, emissao);
  return { emissao, resultado };
}
