import type { AmbienteNfe } from "../nfe/types";
import { getBinarioComCertificado } from "../nfe/soap-https";
import { municipioNfseBelem, urlAdnDanfse, urlNfseBelemDanfse } from "./urls";

export function chaveAcessoNfseDeResposta(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const raw = o.chaveAcesso ?? o.chaveacesso ?? o.chave;
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (/^NFS\d{47}$/.test(s)) return s;
  if (/^\d{44,50}$/.test(s)) return s;
  return null;
}

function corpoEhPdf(buf: Buffer, contentType: string): boolean {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return true;
  return /application\/pdf/i.test(contentType) && buf.length > 20;
}

/**
 * Baixa o DANFSe oficial (PDF) pela chave: Belém municipal primeiro, ADN nacional depois.
 */
export async function baixarDanfsePdf(params: {
  chaveAcesso: string;
  pfx: Buffer;
  senha: string;
  ambiente: AmbienteNfe;
  codigoMunicipioPrestador?: string;
}): Promise<Buffer> {
  const chave = params.chaveAcesso.trim();
  const urls: string[] = [];
  const ibge = params.codigoMunicipioPrestador ?? "";
  if (!ibge || municipioNfseBelem(ibge)) {
    urls.push(urlNfseBelemDanfse(params.ambiente, chave));
  }
  urls.push(urlAdnDanfse(params.ambiente, chave));

  let ultimoErro = "O DANFSe não foi encontrado.";
  for (const url of urls) {
    const { statusCode, body, contentType } = await getBinarioComCertificado(
      url,
      params.pfx,
      params.senha,
    );
    if (statusCode >= 200 && statusCode < 300 && corpoEhPdf(body, contentType)) {
      return body;
    }
    const texto = body.toString("utf8").replace(/\s+/g, " ").trim().slice(0, 280);
    if (statusCode === 404) {
      ultimoErro = "O PDF da NFS-e ainda não está no repositório nacional.";
      continue;
    }
    ultimoErro = texto
      ? `A prefeitura não devolveu o PDF (HTTP ${statusCode}): ${texto}`
      : `A prefeitura não devolveu o PDF (HTTP ${statusCode}).`;
  }
  throw new Error(ultimoErro);
}
