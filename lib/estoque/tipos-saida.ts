export const TIPOS_SAIDA_ESTOQUE = ["venda", "transferencia", "perda", "avulso"] as const;

export type TipoSaidaEstoque = (typeof TIPOS_SAIDA_ESTOQUE)[number];

export const ROTULO_TIPO_SAIDA: Record<TipoSaidaEstoque, string> = {
  venda: "Venda",
  transferencia: "Transferência",
  perda: "Perda",
  avulso: "Avulso",
};

export const STATUS_SAIDA_ESTOQUE = ["confirmada", "cancelada"] as const;
export type StatusSaidaEstoque = (typeof STATUS_SAIDA_ESTOQUE)[number];

export const NOTA_VENDA_STATUS = ["nao_aplicavel", "pronta", "gerada"] as const;
export type NotaVendaStatus = (typeof NOTA_VENDA_STATUS)[number];

export const ROTULO_NOTA_VENDA: Record<NotaVendaStatus, string> = {
  nao_aplicavel: "—",
  pronta: "Pronta (não gerada)",
  gerada: "Gerada",
};

export function isTipoSaidaEstoque(v: unknown): v is TipoSaidaEstoque {
  return typeof v === "string" && (TIPOS_SAIDA_ESTOQUE as readonly string[]).includes(v);
}
