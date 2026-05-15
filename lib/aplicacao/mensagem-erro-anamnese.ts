import { mensagemErroComCodigoSuporte } from "@/lib/aplicacao/mensagem-erro-com-codigo";

/** Mensagem padrão exibida ao usuário quando há registro em `aplicacao_erro_log`. */
export function mensagemErroAnamneseComCodigo(codigoErro: number): string {
  return mensagemErroComCodigoSuporte("Erro ao salvar anamnese", codigoErro);
}

/** HTTP 413 / limite da função serverless (payload multipart grande — típico no celular). */
export const MSG_ERRO_PAYLOAD_GRANDE_ANAMNESE =
  "As fotos enviadas são grandes demais para o servidor aceitar de uma vez. " +
  "Salve primeiro sem fotos ou com menos imagens; ou use fotos em qualidade menor. " +
  "No celular, reduza a resolução da câmera ou comprima antes de anexar.";

/** Mesmo limite em outros envios multipart com imagens (ex.: prontuário do atendimento). */
export const MSG_ERRO_PAYLOAD_GRANDE_FOTOS_ATENDIMENTO =
  "As fotos enviadas são grandes demais para o servidor aceitar de uma vez. " +
  "Tente salvar com menos imagens ou em qualidade menor. " +
  "No celular, reduza a resolução da câmera ou comprima antes de anexar.";
