import * as https from "https";
import { pfxBufferParaCertKeyPem } from "./pfx-pem";
import { opcoesTlsClienteSefaz } from "./tls-client";

export type ResultadoSoapHttps = {
  statusCode: number;
  body: string;
};

/** POST SOAP com autenticação mútua TLS (certificado A1 .pfx). */
export function postSoapComCertificado(
  urlStr: string,
  soapXmlUtf8: string,
  pfx: Buffer,
  passphrase: string,
  contentType: string = "application/soap+xml; charset=utf-8",
): Promise<ResultadoSoapHttps> {
  const u = new URL(urlStr);
  const bodyBuf = Buffer.from(soapXmlUtf8, "utf8");
  const { cert, key } = pfxBufferParaCertKeyPem(pfx, passphrase);
  const tlsOpts = opcoesTlsClienteSefaz();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(bodyBuf.length),
        },
        cert,
        key,
        ...tlsOpts,
        timeout: 90_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Tempo esgotado ao contatar a SEFAZ."));
    });
    req.write(bodyBuf);
    req.end();
  });
}

export type ResultadoHttpsJson = {
  statusCode: number;
  body: string;
};

/** POST JSON com autenticação mútua TLS (certificado A1 .pfx) — Sefin Nacional / ADN. */
export function postJsonComCertificado(
  urlStr: string,
  jsonUtf8: string,
  pfx: Buffer,
  passphrase: string,
): Promise<ResultadoHttpsJson> {
  const u = new URL(urlStr);
  const bodyBuf = Buffer.from(jsonUtf8, "utf8");
  const { cert, key } = pfxBufferParaCertKeyPem(pfx, passphrase);
  const tlsOpts = opcoesTlsClienteSefaz();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": String(bodyBuf.length),
        },
        cert,
        key,
        ...tlsOpts,
        timeout: 90_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Tempo esgotado ao contatar a API de NFS-e."));
    });
    req.write(bodyBuf);
    req.end();
  });
}

export type ResultadoHttpsBinario = {
  statusCode: number;
  body: Buffer;
  contentType: string;
};

/** GET binário com mTLS (DANFSe PDF / ADN). */
export function getBinarioComCertificado(
  urlStr: string,
  pfx: Buffer,
  passphrase: string,
  accept = "application/pdf, application/json;q=0.9, */*;q=0.1",
): Promise<ResultadoHttpsBinario> {
  const u = new URL(urlStr);
  const { cert, key } = pfxBufferParaCertKeyPem(pfx, passphrase);
  const tlsOpts = opcoesTlsClienteSefaz();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: "GET",
        headers: { Accept: accept },
        cert,
        key,
        ...tlsOpts,
        timeout: 90_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks),
            contentType: String(res.headers["content-type"] ?? ""),
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Tempo esgotado ao baixar o DANFSe."));
    });
    req.end();
  });
}
