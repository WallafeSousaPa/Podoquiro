export const TIPOS_SAIDA_ESTOQUE = ["venda", "transferencia", "perda", "avulso"] as const;

export type TipoSaidaEstoque = (typeof TIPOS_SAIDA_ESTOQUE)[number];

export const ROTULO_TIPO_SAIDA: Record<TipoSaidaEstoque, string> = {
  venda: "Venda",
  transferencia: "Transferência",
  perda: "Perda",
  avulso: "Avulso",
};

export const STATUS_SAIDA_ESTOQUE = ["confirmada", "cancelada", "em_transito"] as const;
export type StatusSaidaEstoque = (typeof STATUS_SAIDA_ESTOQUE)[number];

export const NOTA_VENDA_STATUS = ["nao_aplicavel", "pronta", "gerada"] as const;
export type NotaVendaStatus = (typeof NOTA_VENDA_STATUS)[number];

export const ROTULO_NOTA_VENDA: Record<NotaVendaStatus, string> = {
  nao_aplicavel: "—",
  pronta: "Pronta (não gerada)",
  gerada: "Gerada",
};

export function rotuloStatusSaida(
  status: StatusSaidaEstoque,
  tipo: TipoSaidaEstoque,
): string {
  if (status === "em_transito") return "Em trânsito";
  if (status === "cancelada") return "Cancelada";
  if (tipo === "transferencia") return "Recebida";
  return "Confirmada";
}

export function saidaPodeCancelarEstoque(
  status: StatusSaidaEstoque,
  notaVendaStatus: NotaVendaStatus,
): boolean {
  if (notaVendaStatus === "gerada") return false;
  return status === "confirmada" || status === "em_transito";
}

export function isTipoSaidaEstoque(v: unknown): v is TipoSaidaEstoque {
  return typeof v === "string" && (TIPOS_SAIDA_ESTOQUE as readonly string[]).includes(v);
}
