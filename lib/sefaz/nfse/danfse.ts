import type { AmbienteNfe } from "../nfe/types";
import { getBinarioComCertificado } from "../nfe/soap-https";
import { municipioNfseBelem, urlAdnDanfse, urlNfseBelemDanfse } from "./urls";

/** Belém devolve NFS + 50 dígitos (53 no total); a Sefin nacional usa NFS + 47. */
const CHAVE_NFSE_RE = /NFS\d{40,60}/i;

function normalizarChaveNfse(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const m = s.match(CHAVE_NFSE_RE);
  if (m) return m[0].toUpperCase();
  if (/^\d{44,53}$/.test(s)) return s;
  return null;
}

function valorCampoChave(o: Record<string, unknown>): unknown {
  for (const [k, v] of Object.entries(o)) {
    const n = k.toLowerCase().replace(/[_-]/g, "");
    if (n === "chaveacesso" || n === "chave" || n === "chnfse" || n === "chavenfse") {
      return v;
    }
  }
  return undefined;
}

export function chaveAcessoNfseDeResposta(json: unknown): string | null {
  if (json == null) return null;
  if (typeof json === "string") {
    const direto = normalizarChaveNfse(json);
    if (direto) return direto;
    try {
      return chaveAcessoNfseDeResposta(JSON.parse(json));
    } catch {
      return null;
    }
  }
  if (typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const direto = normalizarChaveNfse(valorCampoChave(o));
  if (direto) return direto;
  for (const v of Object.values(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const nested = normalizarChaveNfse(valorCampoChave(v as Record<string, unknown>));
      if (nested) return nested;
    }
  }
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
