/** Mensagem padrão exibida ao usuário quando há registro em `aplicacao_erro_log`. */
export function mensagemErroAnamneseComCodigo(codigoErro: number): string {
  return `Erro ao salvar anamnese. Informe o código de erro: ${codigoErro}.`;
}
