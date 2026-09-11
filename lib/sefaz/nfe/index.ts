/**
 * Integração direta NF-e (modelo 55) — caminho sem provedor.
 *
 * Implementado: status do serviço, montagem mínima homologação, assinatura XMLDSig,
 * envio síncrono `nfeAutorizacaoLote` (SVRS) e cancelamento (`nfeRecepcaoEvento`).
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
export {
  montarChaveAcessoNfe55,
  gerarCodigoNumericoNfe8,
  numeroNfDaChaveAcesso,
  chaveAcessoDoMotivoSefaz,
  cStatDuplicidadeNfe,
} from "./chave-nfe";
export { proximoNumeroNf, proximoNumeroAposDuplicidade } from "./proximo-numero-nf";
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
export {
  montarNfceXmlProduto,
  XPROD_HOMOLOGACAO,
  type DestinatarioNfce,
  type LinhaProdutoNfce,
} from "./montar-nfce-produto";
export {
  urlNfceAutorizacaoSvrs,
  urlNfceRetAutorizacaoSvrs,
  urlNfceConsultaSvrs,
  urlNfceStatusServicoSvrs,
  urlNfceRecepcaoEventoSvrs,
  urlQrCodeNfcePa,
  urlConsultaChaveNfcePa,
} from "./nfce-urls";
export {
  gerarQrCodeNfce,
  inserirInfNFeSuplNfce,
  type DadosQrCodeNfce,
} from "./qrcode-nfce";
export {
  extrairDanfeNfceDoXml,
  type DanfeNfceDados,
  type DanfeItem,
} from "./parse-nfce-danfe";
export {
  extrairDanfeNfeDoXml,
  type DanfeNfeDados,
  type DanfeNfeItem,
} from "./parse-nfe-danfe";
export { assinarNfeXml, assinarEventoNfeXml } from "./assinar-nfe-xml";
export { enviarLoteNfeSincrono, extrairRetornoAutorizacaoLote } from "./autorizacao-lote";
export {
  enviarCancelamentoNfe,
  extrairRetornoCancelamento,
  cancelamentoFoiRegistrado,
  normalizarJustificativaCancelamento,
} from "./cancelamento";
