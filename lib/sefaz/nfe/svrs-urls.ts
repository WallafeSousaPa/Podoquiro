import type { AmbienteNfe } from "./types";

/**
 * SVRS — SEFAZ Virtual RS. O **Pará (PA)** autoriza NF-e modelo 55 pelo SVRS
 * (desde a migração estadual; conferir sempre o [Portal NF-e](https://www.nfe.fazenda.gov.br)).
 *
 * Webservices versão 4.00 — produção e homologação.
 */
const SVRS = {
  autorizacao: {
    "1": "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
    "2":
      "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  },
  retAutorizacao: {
    "1": "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    "2":
      "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  },
  consultaProtocolo: {
    "1": "https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
    "2":
      "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
  },
  statusServico: {
    "1": "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NFeStatusServico4.asmx",
    "2":
      "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NFeStatusServico4.asmx",
  },
  recepcaoEvento: {
    "1": "https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
    "2":
      "https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
  },
  cadConsultaCadastro: {
    "1":
      "https://cad.svrs.rs.gov.br/ws/CadConsultaCadastro/CadConsultaCadastro4.asmx",
    "2":
      "https://cad-homologacao.svrs.rs.gov.br/ws/CadConsultaCadastro/CadConsultaCadastro4.asmx",
  },
} as const;

type Key = "1" | "2";

function k(ambiente: AmbienteNfe): Key {
  return String(ambiente) as Key;
}

export type EndpointsNfeSvrs = {
  autorizacao: string;
  retAutorizacao: string;
  consultaProtocolo: string;
  statusServico: string;
  recepcaoEvento: string;
  cadConsultaCadastro: string;
};

/** Conjunto de URLs SVRS para o ambiente (uso típico: emitente em UF atendida pelo SVRS, ex.: PA). */
export function getEndpointsNfeSvrs(ambiente: AmbienteNfe): EndpointsNfeSvrs {
  const key = k(ambiente);
  return {
    autorizacao: SVRS.autorizacao[key],
    retAutorizacao: SVRS.retAutorizacao[key],
    consultaProtocolo: SVRS.consultaProtocolo[key],
    statusServico: SVRS.statusServico[key],
    recepcaoEvento: SVRS.recepcaoEvento[key],
    cadConsultaCadastro: SVRS.cadConsultaCadastro[key],
  };
}

export function urlNfeAutorizacaoSvrs(ambiente: AmbienteNfe): string {
  return SVRS.autorizacao[k(ambiente)];
}

export function urlNfeRetAutorizacaoSvrs(ambiente: AmbienteNfe): string {
  return SVRS.retAutorizacao[k(ambiente)];
}

export function urlNfeConsultaSvrs(ambiente: AmbienteNfe): string {
  return SVRS.consultaProtocolo[k(ambiente)];
}

export function urlNfeStatusServicoSvrs(ambiente: AmbienteNfe): string {
  return SVRS.statusServico[k(ambiente)];
}

export function urlNfeRecepcaoEventoSvrs(ambiente: AmbienteNfe): string {
  return SVRS.recepcaoEvento[k(ambiente)];
}

export function urlCadConsultaCadastroSvrs(ambiente: AmbienteNfe): string {
  return SVRS.cadConsultaCadastro[k(ambiente)];
}
