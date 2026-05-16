import forge from "node-forge";
import { pfxBufferParaCertKeyPem } from "@/lib/sefaz/nfe/pfx-pem";

/** Nome do titular (CN) do certificado A1 para exibição no retângulo de assinatura. */
export function obterNomeTitularCertificadoPfx(pfx: Buffer, senha: string): string {
  const { cert } = pfxBufferParaCertKeyPem(pfx, senha);
  const certificate = forge.pki.certificateFromPem(cert);
  const attrs = certificate.subject.attributes ?? [];
  for (const a of attrs) {
    if (a.shortName === "CN" || a.name === "commonName") {
      const v = a.value;
      if (typeof v === "string" && v.trim()) return v.trim();
      if (Array.isArray(v)) {
        const joined = v.map((x) => String(x)).join("").trim();
        if (joined) return joined;
      }
    }
  }
  return "Titular do certificado digital";
}
