export {
  urlSefinEmitirNfse,
  urlSefinNacionalBase,
  urlNfseBelemMunicipal,
  urlNfseBelemMunicipalFallback,
  urlEmitirDpsNfse,
  municipioNfseBelem,
} from "./urls";
export { gzipUtf8ParaB64, gunzipB64ParaUtf8, xmlDpsComEncodingUtf8 } from "./gzip-b64";
export {
  TIPO_INSCRICAO_CNPJ_DPS,
  ehRefNfseAdn,
  gerarRefNfseAdn,
  montarIdInfDps,
} from "./id-dps";
export { montarDpsXml, type DadosDpsMontada } from "./montar-dps-xml";
export {
  extrairErrosSefin,
  mensagemDeErroItemSefin,
  mensagemErrosSefin,
  mensagemErrosSefinDeResposta,
  MSG_L9999_TOMADOR,
  MSG_L9999_SCHEMA,
  MSG_L9999_GENERICO,
  type SefinNfseErroItem,
} from "./erros";
export {
  SefinNfseApiError,
  codigoVerificacaoDoXml,
  enviarDpsSefinNacional,
  numeroNfseDoXml,
  type SefinNfseResposta,
} from "./emitir";
