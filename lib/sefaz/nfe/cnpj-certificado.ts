import forge from "node-forge";
import { pfxBufferParaCertKeyPem } from "./pfx-pem";

/** OID ICP-Brasil — CNPJ da pessoa jurídica titular (DOC-ICP-04). */
const OID_CNPJ_ICP_BR = "2.16.76.1.3.3";

const OID_SUBJECT_ALT_NAME = "2.5.29.17";

type Asn1 = forge.asn1.Asn1;

function tipoAtributoDotted(type: unknown): string | null {
  if (typeof type === "string") return type;
  if (Array.isArray(type) && type.every((x) => typeof x === "number")) {
    return type.join(".");
  }
  return null;
}

function digitos14(s: string): string | null {
  const d = s.replace(/\D/g, "");
  if (d.length >= 14) return d.slice(0, 14);
  return null;
}

function textoAsn1(node: Asn1 | undefined): string {
  if (!node) return "";
  const t = node.type;
  if (
    t === forge.asn1.Type.UTF8 ||
    t === forge.asn1.Type.PRINTABLESTRING ||
    t === forge.asn1.Type.IA5STRING
  ) {
    try {
      return forge.util.decodeUtf8(node.value as string);
    } catch {
      return String(node.value ?? "");
    }
  }
  if (t === forge.asn1.Type.BMPSTRING && typeof node.value === "string") {
    return node.value;
  }
  if (node.constructed && Array.isArray(node.value)) {
    return (node.value as Asn1[]).map(textoAsn1).join("");
  }
  return "";
}

/** Desembrulha [0] EXPLICIT e retorna o nó interno (UTF8String etc.). */
function unwrapExplicitContext0(node: Asn1 | undefined): Asn1 | undefined {
  if (!node) return undefined;
  if (
    node.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
    node.type === 0 &&
    node.constructed
  ) {
    const inner = node.value;
    if (Array.isArray(inner) && inner.length > 0) {
      return inner[0] as Asn1;
    }
    if (typeof inner === "string") {
      try {
        return forge.asn1.fromDer(inner);
      } catch {
        return undefined;
      }
    }
  }
  return node;
}

/**
 * GeneralName `otherName` [0]: na extensão SAN o forge guarda `type === 0`
 * (número do CHOICE) e `value` como filhos do OtherName.
 */
function otherNameSequenceDeSanEntry(an: { type?: unknown; value?: unknown }): Asn1[] | null {
  if (an.type !== 0) return null;
  const v = an.value;
  if (Array.isArray(v)) {
    if (v.length === 1) {
      const w = v[0] as Asn1;
      if (w?.constructed && w.type === forge.asn1.Type.SEQUENCE && Array.isArray(w.value)) {
        return w.value as Asn1[];
      }
    }
    if (v.length >= 2) return v as Asn1[];
    return null;
  }
  if (typeof v === "string") {
    try {
      const seq = forge.asn1.fromDer(v);
      if (seq.constructed && Array.isArray(seq.value) && seq.value.length >= 2) {
        return seq.value as Asn1[];
      }
    } catch {
      return null;
    }
  }
  return null;
}

function cnpjDeOtherNameSequence(seq: Asn1[]): string | null {
  const oidNode = seq[0];
  if (!oidNode || oidNode.type !== forge.asn1.Type.OID) return null;
  let oid: string;
  try {
    oid = forge.asn1.derToOid(oidNode.value as string);
  } catch {
    return null;
  }
  if (oid !== OID_CNPJ_ICP_BR) return null;
  const wrapped = unwrapExplicitContext0(seq[1]);
  const texto = textoAsn1(wrapped ?? seq[1]);
  return digitos14(texto);
}

function extrairCnpjSubjectAltName(cert: forge.pki.Certificate): string | null {
  for (const ext of cert.extensions || []) {
    if (ext.id !== OID_SUBJECT_ALT_NAME && ext.name !== "subjectAltName") continue;
    if (!ext.altNames) continue;
    for (const an of ext.altNames) {
      const seq = otherNameSequenceDeSanEntry(an);
      if (!seq) continue;
      const cnpj = cnpjDeOtherNameSequence(seq);
      if (cnpj) return cnpj;
    }
  }
  return null;
}

function extrairCnpjSubjectDnOid(cert: forge.pki.Certificate): string | null {
  for (const attr of cert.subject.attributes) {
    const dotted = tipoAtributoDotted(attr.type);
    if (dotted !== OID_CNPJ_ICP_BR) continue;
    const cnpj = digitos14(String(attr.value ?? ""));
    if (cnpj) return cnpj;
  }
  return null;
}

/**
 * CNPJ (14 dígitos) do titular no certificado ICP-Brasil.
 * Prioridade: **Subject Alternative Name** (`otherName` 2.16.76.1.3.3), depois subject DN com o mesmo OID.
 * Não usa heurística de “qualquer 14 dígitos” no subject (evita `serialNumber` e campos da AC).
 */
export function extrairCnpj14DoCertificadoPem(pemCertificado: string): string | null {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(pemCertificado.trim());
  } catch {
    return null;
  }
  return extrairCnpjSubjectAltName(cert) ?? extrairCnpjSubjectDnOid(cert);
}

/** CNPJ de 14 dígitos extraído do PFX (certificado folha), ou `null` se não identificado. */
export function extrairCnpj14DoPfx(pfx: Buffer, senhaCertificado: string): string | null {
  const { cert } = pfxBufferParaCertKeyPem(pfx, senhaCertificado);
  return extrairCnpj14DoCertificadoPem(cert);
}
