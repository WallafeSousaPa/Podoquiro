import type { SupabaseClient } from "@supabase/supabase-js";
import { notaasConsultarStatus } from "./client";
import { obterApiKeyNotaas } from "./config";
import { statusNotaasParaInterno } from "./status";
import type { StatusNfseInterno } from "./types";

export type NfseEmissaoSyncRow = {
  id: string;
  notaas_invoice_id: string | null;
  status: string;
};

export type ResultadoSyncNfse = {
  id: string;
  statusAnterior: string;
  statusNovo: StatusNfseInterno;
  alterado: boolean;
  detalhe?: string;
};

/** Atualiza uma emissão local com o status atual da Notaas. */
export async function sincronizarEmissaoNfse(
  supabase: SupabaseClient,
  idEmpresa: number,
  row: NfseEmissaoSyncRow,
): Promise<ResultadoSyncNfse> {
  if (!row.notaas_invoice_id) {
    return {
      id: row.id,
      statusAnterior: row.status,
      statusNovo: row.status as StatusNfseInterno,
      alterado: false,
      detalhe: "Sem invoiceId Notaas.",
    };
  }

  const apiKey = await obterApiKeyNotaas(supabase, idEmpresa);
  if (!apiKey) {
    throw new Error("NOTAAS_API_KEY_NAO_CONFIGURADA");
  }

  const remoto = await notaasConsultarStatus(apiKey, row.notaas_invoice_id);
  const statusNovo = statusNotaasParaInterno(remoto.status, {
    errorMessage: remoto.errorMessage,
  });

  const patch: Record<string, unknown> = {
    status: statusNovo,
    payload_status: remoto,
    numero_nfse: remoto.numeroNfe ?? remoto.nNFSe ?? null,
    ch_nfse: remoto.chNFSe ?? null,
    ambiente: remoto.ambiente ?? null,
    pdf_url: remoto.pdfUrl ?? null,
    xml_url: remoto.xmlUrl ?? null,
    error_code: remoto.errorCode ?? null,
    error_message: remoto.errorMessage ?? null,
  };

  if (statusNovo === "emitida") {
    patch.emitted_at = remoto.emittedAt ?? remoto.issuedAt ?? new Date().toISOString();
  }
  if (statusNovo === "cancelada") {
    patch.cancelled_at = remoto.cancelledAt ?? new Date().toISOString();
  }

  const { error } = await supabase.from("nfse_emissoes").update(patch).eq("id", row.id);

  if (error) throw new Error(error.message);

  return {
    id: row.id,
    statusAnterior: row.status,
    statusNovo,
    alterado: statusNovo !== row.status,
    detalhe: remoto.errorMessage ?? undefined,
  };
}
