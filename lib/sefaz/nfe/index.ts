/**
 * Integração direta NF-e (modelo 55) — caminho sem provedor.
 *
 * Implementado: status do serviço, montagem mínima homologação, assinatura XMLDSig,
 * envio síncrono `nfeAutorizacaoLote` (SVRS). Próximos passos: cancelamento, CC-e, produção completa.
 */

export type { AmbienteNfe, SiglaUf, StatusEmissaoNfe } from "./types";
export type { ConfigNfeGlobal } from "./config";
export { getConfigNfeGlobal } from "./config";
export {
  obterMaterialCertificadoNfe,
  obterMetadataCertificadoNfe,
  prepararGravacaoCertificado,
  type MaterialCertificadoNfe,
  type MetadataCertificadoNfe,
} from "./certificado-db";
export { getNfeEndpointsEmitentePa } from "./emitente-pa";
export type { EndpointsNfeSvrs } from "./svrs-urls";
export {
  getEndpointsNfeSvrs,
  urlNfeAutorizacaoSvrs,
  urlNfeConsultaSvrs,
  urlNfeRetAutorizacaoSvrs,
  urlNfeRecepcaoEventoSvrs,
  urlNfeStatusServicoSvrs,
  urlCadConsultaCadastroSvrs,
} from "./svrs-urls";
export { carregarCertificadoEmpresa } from "./carregar-certificado";
export { extrairCnpj14DoCertificadoPem, extrairCnpj14DoPfx } from "./cnpj-certificado";
export {
  consultarStatusServicoNfe,
  extrairRetornoStatusServico,
} from "./status-servico";
export { codigoUfParaNfe } from "./cuf-ibge";
export { montarChaveAcessoNfe55, gerarCodigoNumericoNfe8 } from "./chave-nfe";
export {
  montarNfeXmlMinimaHomologacao,
  normalizarIeNfeEmitente,
  NCM_PADRAO_NFE_TESTE,
  XNOME_DEST_HOMOLOGACAO,
} from "./montar-nfe-minima";
export type { DadosEmitenteNfeMinimo } from "./montar-nfe-minima";
export {
  montarNfeXmlProdutoNacional,
  type DestinatarioProdutoNfe,
  type LinhaProdutoNfe,
} from "./montar-nfe-produto";
export { assinarNfeXml } from "./assinar-nfe-xml";
export { enviarLoteNfeSincrono, extrairRetornoAutorizacaoLote } from "./autorizacao-lote";
