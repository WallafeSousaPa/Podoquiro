/** Mensagem genérica com código gravado em `aplicacao_erro_log`. */
export function mensagemErroComCodigoSuporte(prefixo: string, codigo: number): string {
  const p = prefixo.trim().replace(/\.\s*$/, "");
  return `${p}. Informe o código de erro: ${codigo}.`;
}
