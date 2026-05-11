import { SignedXml } from "xml-crypto";
import { pfxBufferParaCertKeyPem } from "./pfx-pem";

/**
 * Assina o elemento `infNFe` (Id `NFe` + chave) com XMLDSig RSA-SHA1 + SHA1 digest,
 * padrão NF-e (MOC: Enveloped + C14N 1.0, não xml-exc-c14n nas Transforms da Reference).
 * `xmlNfe` deve ser o documento `<NFe>...</NFe>` **sem** `<?xml ...?>`.
 */
export function assinarNfeXml(xmlNfe: string, pfx: Buffer, senhaCertificado: string): string {
  const { cert, key } = pfxBufferParaCertKeyPem(pfx, senhaCertificado);
  const c14nNfe = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
  const sig = new SignedXml({
    privateKey: key,
    publicCert: cert,
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    canonicalizationAlgorithm: c14nNfe,
  });
  sig.addReference({
    xpath: "//*[local-name(.)='infNFe']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      c14nNfe,
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  });
  sig.computeSignature(xmlNfe.trim(), {
    location: {
      reference: "//*[local-name(.)='infNFe']",
      action: "after",
    },
  });
  return sig.getSignedXml();
}
