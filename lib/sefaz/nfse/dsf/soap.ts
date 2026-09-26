import * as http from "http";
import * as https from "https";
import { NS_SOAP_DSF } from "./urls";

export function envelopeSoapDsf(operacao: string, xmlMensagem: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:dsf="${NS_SOAP_DSF}"><soapenv:Body><dsf:${operacao} soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><mensagemXml xsi:type="xsd:string"><![CDATA[${xmlMensagem}]]></mensagemXml></dsf:${operacao}></soapenv:Body></soapenv:Envelope>`;
}

export function postSoapDsf(
  urlStr: string,
  soapXmlUtf8: string,
  hops = 0,
): Promise<{ statusCode: number; body: string }> {
  if (hops > 3) {
    return Promise.reject(new Error("Redirecionamento demais ao contatar a NFS-e da prefeitura de Belém."));
  }
  const u = new URL(urlStr);
  const lib = u.protocol === "https:" ? https : http;
  const bodyBuf = Buffer.from(soapXmlUtf8, "utf8");
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: "POST",
        family: 4,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: '""',
          "Content-Length": String(bodyBuf.length),
        },
        timeout: 90_000,
      },
      (res) => {
        const loc = res.headers.location;
        const code = res.statusCode ?? 0;
        if (loc && code >= 301 && code <= 308) {
          const next = new URL(loc, urlStr).toString();
          res.resume();
          postSoapDsf(next, soapXmlUtf8, hops + 1).then(resolve, reject);
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            statusCode: code,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Tempo esgotado ao contatar a NFS-e da prefeitura de Belém (DSF)."));
    });
    req.write(bodyBuf);
    req.end();
  });
}
