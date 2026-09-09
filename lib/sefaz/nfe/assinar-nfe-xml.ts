import { SignedXml } from "xml-crypto";
import { pfxBufferParaCertKeyPem } from "./pfx-pem";

/**
 * Assina o elemento `infNFe` (Id `NFe` + chave) com XMLDSig RSA-SHA1 + SHA1 digest,
 * padrão NF-e (MOC: Enveloped + C14N 1.0, não xml-exc-c14n nas Transforms da Reference).
 * `xmlNfe` deve ser o documento `<NFe>...</NFe>` **sem** `<?xml ...?>`.
 */
function assinarPorTagLocal(
  xml: string,
  pfx: Buffer,
  senhaCertificado: string,
  tagLocal: "infNFe" | "infEvento",
): string {
  const { cert, key } = pfxBufferParaCertKeyPem(pfx, senhaCertificado);
  const c14nNfe = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
  const xpath = `//*[local-name(.)='${tagLocal}']`;
  const sig = new SignedXml({
    privateKey: key,
    publicCert: cert,
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    canonicalizationAlgorithm: c14nNfe,
  });
  sig.addReference({
    xpath,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      c14nNfe,
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  });
  sig.computeSignature(xml.trim(), {
    location: { reference: xpath, action: "after" },
  });
  return sig.getSignedXml();
}

export function assinarNfeXml(xmlNfe: string, pfx: Buffer, senhaCertificado: string): string {
  return assinarPorTagLocal(xmlNfe, pfx, senhaCertificado, "infNFe");
}

/** Assina `infEvento` (cancelamento, CC-e, etc.) no XML `<evento>...</evento>`. */
export function assinarEventoNfeXml(
  xmlEvento: string,
  pfx: Buffer,
  senhaCertificado: string,
): string {
  return assinarPorTagLocal(xmlEvento, pfx, senhaCertificado, "infEvento");
}
