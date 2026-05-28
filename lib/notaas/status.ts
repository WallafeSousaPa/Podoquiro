import type { StatusNfseInterno, StatusNotaas } from "./types";

/** Converte status Notaas → status exibido no sistema. */
export function statusNotaasParaInterno(
  notaasStatus: string,
  opts?: { errorMessage?: string | null },
): StatusNfseInterno {
  const msg = (opts?.errorMessage ?? "").toLowerCase();
  if (msg.includes("conting") || msg.includes("contingência")) {
    return "contingencia";
  }

  switch (notaasStatus as StatusNotaas) {
    case "queued":
      return "pendente";
    case "processing":
      return "processando";
    case "issued":
      return "emitida";
    case "cancelled":
      return "cancelada";
    case "error":
      return "erro";
    default:
      return "processando";
  }
}

export function labelStatusNfse(status: StatusNfseInterno | string): string {
  switch (status) {
    case "pendente":
      return "Pendente";
    case "processando":
      return "Processando";
    case "emitida":
      return "Emitida";
    case "cancelada":
      return "Cancelada";
    case "contingencia":
      return "Contingência";
    case "erro":
      return "Erro";
    default:
      return status;
  }
}

/** Texto auxiliar alinhado ao painel Notaas (ex.: queued → Aguardando emissão). */
export function descricaoStatusNfse(
  status: StatusNfseInterno | string,
  notaasStatus?: string | null,
): string | null {
  const bruto = (notaasStatus ?? "").toLowerCase();
  if (bruto === "queued" || status === "pendente") {
    return "Aguardando emissão";
  }
  if (bruto === "processing" || status === "processando") {
    return "Processando na prefeitura";
  }
  if (bruto === "issued" || status === "emitida") {
    return "Nota emitida";
  }
  if (bruto === "cancelled" || status === "cancelada") {
    return "Nota cancelada";
  }
  if (bruto === "error" || status === "erro") {
    return "Falha na emissão";
  }
  if (status === "contingencia") {
    return "Em contingência";
  }
  return null;
}

/** Lê status bruto Notaas salvo em payload_status (sync). */
export function statusNotaasDePayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const s = (payload as { status?: unknown }).status;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

export function badgeClassStatusNfse(status: string): string {
  switch (status) {
    case "emitida":
      return "badge-success";
    case "cancelada":
      return "badge-dark";
    case "contingencia":
      return "badge-warning";
    case "erro":
      return "badge-danger";
    case "processando":
      return "badge-info";
    case "pendente":
      return "badge-secondary";
    default:
      return "badge-light";
  }
}
