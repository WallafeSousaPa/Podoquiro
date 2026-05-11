import { existsSync, readFileSync } from "fs";
import * as path from "path";
import * as tls from "tls";
import { ICP_BRASIL_V10_RAIZ_PEM } from "./cas/icp-brasil-v10-embedded";

export type OpcoesTlsClienteSefaz = {
  ca?: string[];
  rejectUnauthorized: boolean;
};

/** Caminho absoluto (Windows/Linux) ou relativo só dentro de `certs-nfe/` na raiz do projeto. */
function resolverPemCadeia(p: string): string | null {
  const trimmed = p.trim();
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }
  const partes = trimmed.split(/[/\\]+/).filter((s) => s && s !== "." && s !== "..");
  if (partes.length === 0) return null;
  return path.join(/* turbopackIgnore: true */ process.cwd(), "certs-nfe", ...partes);
}

/**
 * TLS ao conectar na SEFAZ/SVRS: junta as CAs do Node com a **AC Raiz ICP-Brasil v10**
 * (o servidor SVRS usa cadeia SERPRO SSLv1 → essa raiz; o trust store padrão do Node não a inclui).
 *
 * Opcional: `NFE_EXTRA_CA_CERTS_PATH` — PEM adicional (homólogo ao NODE_EXTRA_CA_CERTS).
 */
export function opcoesTlsClienteSefaz(): OpcoesTlsClienteSefaz {
  const insecure = process.env.NFE_TLS_INSECURE_SKIP_VERIFY?.trim() === "1";
  const pemExtras: string[] = [ICP_BRASIL_V10_RAIZ_PEM];

  const rel = process.env.NFE_EXTRA_CA_CERTS_PATH?.trim();
  if (rel) {
    const abs = resolverPemCadeia(rel);
    if (abs && existsSync(abs)) {
      try {
        pemExtras.push(readFileSync(abs, "utf8").trim());
      } catch {
        /* ignora arquivo ilegível */
      }
    }
  }

  return {
    ca: [...tls.rootCertificates, ...pemExtras],
    rejectUnauthorized: !insecure,
  };
}
