import forge from "node-forge";

/**
 * NF-e exige EndCertOnly: um único `X509Certificate` na assinatura. PFXs costumam trazer
 * cadeia (folha + intermediárias); o xml-crypto emitiria vários irmãos e o XSD rejeita (225).
 */
function certificadoCorrespondeChaveRsa(
  cert: forge.pki.Certificate,
  privateKey: forge.pki.PrivateKey,
): boolean {
  const pub = cert.publicKey as forge.pki.rsa.PublicKey | undefined;
  const priv = privateKey as forge.pki.rsa.PrivateKey;
  if (!pub?.n || !pub?.e || !priv?.n || !priv?.e) {
    return false;
  }
  return pub.n.compareTo(priv.n) === 0 && pub.e.compareTo(priv.e) === 0;
}

function escolherCertificadoFolha(
  bags: forge.pkcs12.Bag[],
  privateKey: forge.pki.PrivateKey,
): forge.pki.Certificate {
  const certs: forge.pki.Certificate[] = [];
  for (const b of bags) {
    if (b.cert) certs.push(b.cert);
  }
  if (certs.length === 0) {
    throw new Error("PFX sem certificado.");
  }
  for (const c of certs) {
    if (certificadoCorrespondeChaveRsa(c, privateKey)) {
      return c;
    }
  }
  return certs[0];
}

/**
 * Abre PKCS#12 e devolve PEMs para `https.request({ cert, key })`.
 * Usa node-forge para suportar PFX com cifras legadas (ex.: RC2) que o OpenSSL 3 do Node rejeita com "Unsupported PKCS12 PFX data".
 */
export function pfxBufferParaCertKeyPem(pfx: Buffer, passphrase: string): {
  cert: string;
  key: string;
} {
  let asn1: forge.asn1.Asn1;
  try {
    asn1 = forge.asn1.fromDer(pfx.toString("binary"));
  } catch {
    throw new Error(
      "PFX inválido ou corrompido (não é ASN.1 DER). Reenvie o arquivo .pfx/.p12 em Parâmetros.",
    );
  }

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/mac|password|passphrase|pkcs12|invalid|decrypt/i.test(msg)) {
      throw new Error(
        "Não foi possível abrir o PFX. Verifique a senha em Parâmetros ou reexporte o certificado (preferir AES-256).",
      );
    }
    throw new Error(`Falha ao ler o PFX: ${msg}`);
  }

  const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  let keyBag = shrouded[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) {
    const plain = p12.getBags({ bagType: forge.pki.oids.keyBag });
    keyBag = plain[forge.pki.oids.keyBag]?.[0];
  }
  if (!keyBag?.key) {
    throw new Error("PFX sem chave privada (key bag).");
  }

  const privateKey = keyBag.key as forge.pki.PrivateKey;
  const key = forge.pki.privateKeyToPem(privateKey);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const bags = certBags[forge.pki.oids.certBag] ?? [];
  const leaf = escolherCertificadoFolha(bags, privateKey);
  const cert = forge.pki.certificateToPem(leaf);

  return { cert, key };
}
