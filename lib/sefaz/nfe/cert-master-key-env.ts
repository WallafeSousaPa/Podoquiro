/** Variável de ambiente NFE_CERT_MASTER_KEY (cifra do .pfx no banco). */

export function nfeCertMasterKeyConfigurada(): boolean {
  return Boolean(process.env.NFE_CERT_MASTER_KEY?.trim());
}

export function assertNfeCertMasterKeyConfigurada(): void {
  if (!nfeCertMasterKeyConfigurada()) {
    throw new Error("CERTIFICADO_MASTER_KEY_AUSENTE");
  }
}
