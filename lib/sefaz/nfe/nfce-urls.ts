import type { AmbienteNfe } from "./types";

/**
 * NFC-e (modelo 65). O **Pará (PA)** autoriza a NFC-e pelo **SVRS** (host `nfce.svrs.rs.gov.br`),
 * distinto do host de NF-e 55 (`nfe.svrs.rs.gov.br`). Webservices versão 4.00.
 */
const SVRS_NFCE = {
  autorizacao: {
    "1": "https://nfce.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
    "2":
      "https://nfce-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  },
  retAutorizacao: {
    "1": "https://nfce.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    "2":
      "https://nfce-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  },
  consultaProtocolo: {
    "1": "https://nfce.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
    "2":
      "https://nfce-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
  },
  statusServico: {
    "1": "https://nfce.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
    "2":
      "https://nfce-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  },
  recepcaoEvento: {
    "1": "https://nfce.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
    "2":
      "https://nfce-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
  },
} as const;

/**
 * URLs de consulta da NFC-e do **Pará** usadas na composição do DANFE-NFC-e:
 * - `qrCode`: base do QR Code (`?p=...`).
 * - `urlChave`: endereço impresso para consulta manual pela chave de acesso.
 */
const PA_NFCE_CONSULTA = {
  qrCode: {
    "1": "https://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/nfceForm.seam",
    "2":
      "https://appnfc.sefa.pa.gov.br/portal-homologacao/view/consultas/nfce/nfceForm.seam",
  },
  urlChave: {
    "1":
      "https://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/consultanfce.seam",
    // O schema da NFC-e limita `urlChave` a 85 caracteres. A URL oficial de homologação
    // do PA tem 86 com "https://"; usar "http://" mantém o caminho exato em 85 (o portal
    // redireciona para https). Produção (74 chars) permanece com "https://".
    "2":
      "http://appnfc.sefa.pa.gov.br/portal-homologacao/view/consultas/nfce/consultanfce.seam",
  },
} as const;

type Key = "1" | "2";

function k(ambiente: AmbienteNfe): Key {
  return String(ambiente) as Key;
}

/** Endpoint de autorização (`nfeAutorizacaoLote`) da NFC-e via SVRS. */
export function urlNfceAutorizacaoSvrs(ambiente: AmbienteNfe): string {
  return SVRS_NFCE.autorizacao[k(ambiente)];
}

export function urlNfceRetAutorizacaoSvrs(ambiente: AmbienteNfe): string {
  return SVRS_NFCE.retAutorizacao[k(ambiente)];
}

export function urlNfceConsultaSvrs(ambiente: AmbienteNfe): string {
  return SVRS_NFCE.consultaProtocolo[k(ambiente)];
}

export function urlNfceStatusServicoSvrs(ambiente: AmbienteNfe): string {
  return SVRS_NFCE.statusServico[k(ambiente)];
}

export function urlNfceRecepcaoEventoSvrs(ambiente: AmbienteNfe): string {
  return SVRS_NFCE.recepcaoEvento[k(ambiente)];
}

/** Base do QR Code da NFC-e (PA), sem os parâmetros `?p=`. */
export function urlQrCodeNfcePa(ambiente: AmbienteNfe): string {
  return PA_NFCE_CONSULTA.qrCode[k(ambiente)];
}

/** URL de consulta da NFC-e por chave de acesso (PA), para `infNFeSupl/urlChave`. */
export function urlConsultaChaveNfcePa(ambiente: AmbienteNfe): string {
  return PA_NFCE_CONSULTA.urlChave[k(ambiente)];
}
