import type { NextConfig } from "next";

/** Hosts (sem `http://`) permitidos no dev além do host padrão — necessário para HMR/WebSocket em LAN. */
function parseAllowedDevOrigins(): string[] {
  const raw = process.env.ALLOWED_DEV_ORIGINS;
  return (
    raw
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? []
  );
}

const allowedDevOrigins = parseAllowedDevOrigins();

const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  /** Evita bundling do signpdf/pdf-lib no servidor (API de assinatura do termo). */
  serverExternalPackages: [
    "@signpdf/signpdf",
    "@signpdf/signer-p12",
    "@signpdf/placeholder-plain",
    "@signpdf/placeholder-pdfkit010",
    "@signpdf/utils",
    "pdf-lib",
    "node-forge",
  ],
};

export default nextConfig;
