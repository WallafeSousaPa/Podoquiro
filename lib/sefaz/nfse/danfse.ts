import type { AmbienteNfe } from "../nfe/types";
import { getBinarioComCertificado } from "../nfe/soap-https";
import { gunzipB64ParaUtf8 } from "./gzip-b64";
import {
  municipioNfseBelem,
  urlAdnDanfse,
  urlNfseBelemDanfse,
  urlSefinDanfse,
} from "./urls";

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

/** DSF/ADN exigem 50 dígitos na URL (sem o prefixo NFS). */
export function chaveNfse50Digitos(chave: string): string | null {
  const raw = chave.trim().toUpperCase().replace(/\s+/g, "");
  const digits = (raw.startsWith("NFS") ? raw.slice(3) : raw).replace(/\D/g, "");
  return digits.length === 50 ? digits : digits.length >= 44 ? digits : null;
}

export function nfseXmlGZipDeResposta(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (k.toLowerCase().replace(/[_-]/g, "") === "nfsexmlgzipb64" && typeof v === "string") {
      try {
        return gunzipB64ParaUtf8(v);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function corpoEhPdf(buf: Buffer, contentType: string): boolean {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return true;
  return /application\/pdf/i.test(contentType) && buf.length > 20;
}

/**
 * Baixa o DANFSe oficial (PDF) pela chave de 50 dígitos: ADN, Sefin e Belém.
 */
export async function baixarDanfsePdf(params: {
  chaveAcesso: string;
  pfx: Buffer;
  senha: string;
  ambiente: AmbienteNfe;
  codigoMunicipioPrestador?: string;
}): Promise<Buffer> {
  const chaveOrig = params.chaveAcesso.trim();
  const chave50 = chaveNfse50Digitos(chaveOrig) ?? chaveOrig;
  const ibge = params.codigoMunicipioPrestador ?? "";
  const urls: string[] = [
    urlAdnDanfse(params.ambiente, chave50),
    urlSefinDanfse(params.ambiente, chave50),
  ];
  if (!ibge || municipioNfseBelem(ibge)) {
    urls.push(urlNfseBelemDanfse(params.ambiente, chave50));
  }

  const tentativas = await Promise.allSettled(
    urls.map((url) =>
      getBinarioComCertificado(
        url,
        params.pfx,
        params.senha,
        "application/pdf, application/json;q=0.9, */*;q=0.1",
        8_000,
      ),
    ),
  );
  for (const t of tentativas) {
    if (t.status !== "fulfilled") continue;
    const { statusCode, body, contentType } = t.value;
    if (statusCode >= 200 && statusCode < 300 && corpoEhPdf(body, contentType)) {
      return body;
    }
  }
  throw new Error("O serviço de PDF da prefeitura está temporariamente indisponível.");
}
