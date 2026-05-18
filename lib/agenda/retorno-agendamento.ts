/** Fluxo retorno pós-atendimento (podóloga → recepção / caixa). */

export const STATUS_RETORNO_AGENDAMENTO = "curativo_agendado" as const;

export const MSG_RETORNO_OBRIGATORIO_CAIXA =
  "Este atendimento exige agendar o retorno (curativo) antes de registrar o pagamento.";

export function agendamentoExigeRetornoNoCaixa(ag: {
  agendar_retorno?: boolean | null;
  id_retorno?: number | null;
}): boolean {
  return Boolean(ag.agendar_retorno) && (ag.id_retorno == null || ag.id_retorno <= 0);
}
