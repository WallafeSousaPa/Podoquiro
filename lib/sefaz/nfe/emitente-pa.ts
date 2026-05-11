import type { AmbienteNfe } from "./types";
import { getEndpointsNfeSvrs, type EndpointsNfeSvrs } from "./svrs-urls";

/**
 * Emitente no **Pará (PA)** — NF-e 55 autorizada pelo **SVRS** (mesmos endpoints RS).
 * Certificado **A1** deve ficar apenas no disco do servidor (`NFE_CERT_PATH`), nunca no Git.
 */
export function getNfeEndpointsEmitentePa(ambiente: AmbienteNfe): EndpointsNfeSvrs {
  return getEndpointsNfeSvrs(ambiente);
}
