/** tpAmb da NF-e: 1 produção, 2 homologação */
export type AmbienteNfe = 1 | 2;

export type StatusEmissaoNfe =
  | "rascunho"
  | "assinada"
  | "transmitida"
  | "autorizada"
  | "rejeitada"
  | "denegada"
  | "cancelada";

/** UF da SEFAZ autora (SVRS ou autorizadora própria) */
export type SiglaUf =
  | "AC"
  | "AL"
  | "AM"
  | "AP"
  | "BA"
  | "CE"
  | "DF"
  | "ES"
  | "GO"
  | "MA"
  | "MG"
  | "MS"
  | "MT"
  | "PA"
  | "PB"
  | "PE"
  | "PI"
  | "PR"
  | "RJ"
  | "RN"
  | "RO"
  | "RR"
  | "RS"
  | "SC"
  | "SE"
  | "SP"
  | "TO";
