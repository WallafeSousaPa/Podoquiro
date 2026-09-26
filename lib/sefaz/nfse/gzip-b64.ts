import { gunzipSync, gzipSync } from "node:zlib";

const DECL_XML_UTF8 = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * A Sefin (E1229) exige declaração explícita UTF-8.
 * A assinatura é sobre `infDPS`, então a declaração entra depois de assinar.
 */
export function xmlDpsComEncodingUtf8(xml: string): string {
  const semBom = xml.replace(/^\uFEFF/, "");
  const semDecl = semBom.replace(/^\s*<\?xml\b[^?]*\?>\s*/i, "");
  return `${DECL_XML_UTF8}\n${semDecl.trimStart()}`;
}

export function gzipUtf8ParaB64(xmlUtf8: string): string {
  return gzipSync(Buffer.from(xmlUtf8, "utf8"), { level: 9 }).toString("base64");
}

export function gunzipB64ParaUtf8(b64: string): string {
  return gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
}
