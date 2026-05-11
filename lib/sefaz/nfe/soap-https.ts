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
