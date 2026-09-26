/** Belém/PA — código SIAFI no DSF (não é o IBGE 1501402). */
export const DSF_BELEM_SIAFI = "0427";
export const DSF_BELEM_IBGE = "1501402";

export const URL_DSF_BELEM = "http://www.issdigitalbel.com.br/WsNFe2/LoteRps.jws";
export const NS_SOAP_DSF = "http://proces.wsnfe2.dsfnet.com.br";

export function municipioUsaDsfBelem(ibge: string): boolean {
  const d = String(ibge).replace(/\D/g, "");
  return d === DSF_BELEM_IBGE || d === "150142";
}
