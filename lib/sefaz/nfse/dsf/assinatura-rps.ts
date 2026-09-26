import { createHash } from "node:crypto";

function padLeft(s: string, n: number, ch: string): string {
  const t = s.slice(0, n);
  return t.padStart(n, ch);
}

function padRight(s: string, n: number, ch: string): string {
  const t = s.slice(0, n);
  return t.padEnd(n, ch);
}

/**
 * Hash SHA-1 do RPS DSF (não é XMLDSig).
 * Concatena IM, série, número, data, tributação, situação, retenção, valores, atividade e tomador.
 */
export function hashAssinaturaRpsDsf(p: {
  inscricaoMunicipal: string;
  serieRps: string;
  numeroRps: string;
  dataEmissaoYmd: string;
  tributacao: string;
  situacaoRps: string;
  tipoRecolhimento: string;
  valorServicos: number;
  valorDeducoes: number;
  codigoAtividade: string;
  cpfCnpjTomador: string;
}): string {
  const ymd = p.dataEmissaoYmd.replace(/\D/g, "").slice(0, 8);
  const retencao = p.tipoRecolhimento === "A" ? "N" : "S";
  const valorFinal = Math.round(p.valorServicos * 100);
  const valorDed = Math.round(p.valorDeducoes * 100);
  const linha =
    padLeft(p.inscricaoMunicipal.replace(/\D/g, ""), 11, "0") +
    padRight(p.serieRps, 5, " ") +
    padLeft(p.numeroRps.replace(/\D/g, ""), 12, "0") +
    ymd +
    padRight(p.tributacao, 2, " ") +
    p.situacaoRps +
    retencao +
    padLeft(String(valorFinal), 15, "0") +
    padLeft(String(valorDed), 15, "0") +
    padLeft(p.codigoAtividade.replace(/\D/g, ""), 10, "0") +
    padLeft(p.cpfCnpjTomador.replace(/\D/g, ""), 14, "0");
  return createHash("sha1").update(linha, "utf8").digest("hex");
}
