export const MENSAGEM_PADRAO_WHATSAPP_CLIENTES_AUSENTES =
  "Notamos que faz algum tempo desde seu último atendimento conosco. Gostaríamos de agendar um retorno. Quando seria um bom horário para você?";

export const MAX_CARACTERES_MENSAGEM_WHATSAPP_CLIENTES_AUSENTES = 2000;

/** Monta texto final: saudação com nome + corpo personalizado ({nome} substituível). */
export function montarMensagemWhatsappClienteAusente(
  nomePaciente: string,
  template: string,
): string {
  const nome = nomePaciente.trim() || "paciente";
  const corpo = (template.trim() || MENSAGEM_PADRAO_WHATSAPP_CLIENTES_AUSENTES).replace(
    /\{nome\}/gi,
    nome,
  );
  return `Olá, ${nome}!\n\n${corpo}`;
}

export function mensagemWhatsappClientesAusentesParaExibicao(stored: string | null | undefined): string {
  return stored?.trim() || MENSAGEM_PADRAO_WHATSAPP_CLIENTES_AUSENTES;
}
