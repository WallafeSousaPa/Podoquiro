export const MENSAGEM_PADRAO_WHATSAPP_TAXA_AGENDAMENTO = `Olá {nome}, para confirmar seu agendamento é necessário pagar uma taxa para disponibilizar seu horário. Não se preocupe, ao final do atendimento no dia será abatido do valor total do seu atendimento.

Segue o link de pagamento: {link}`;

export const MAX_CARACTERES_MENSAGEM_WHATSAPP_TAXA_AGENDAMENTO = 2000;

export function mensagemWhatsappTaxaAgendamentoParaExibicao(
  stored: string | null | undefined,
): string {
  return stored?.trim() || MENSAGEM_PADRAO_WHATSAPP_TAXA_AGENDAMENTO;
}

/** Substitui {nome} e {link} no template da empresa. */
export function montarMensagemWhatsappTaxaAgendamento(
  nomePaciente: string,
  linkPagamento: string,
  template: string | null | undefined,
): string {
  const nome = nomePaciente.trim() || "cliente";
  const link = linkPagamento.trim();
  const corpo = mensagemWhatsappTaxaAgendamentoParaExibicao(template);
  return corpo.replace(/\{nome\}/gi, nome).replace(/\{link\}/gi, link);
}
