import { normalizarNomePlanilha } from "@/lib/agenda/importacao-planilha-parse";
import type { LinhaPlanilhaBruta } from "@/lib/agenda/importacao-planilha-servico";

function canonHeader(k: string): string {
  return normalizarNomePlanilha(String(k))
    .replace(/\s/g, "")
    .replace(/[()]/g, "");
}

/** Monta mapa cabeçalho normalizado → valor da linha. */
export function indexarLinhaPlanilha(obj: Record<string, unknown>): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    m.set(canonHeader(k), v);
  }
  return m;
}

function getCel(m: Map<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const ck = canonHeader(k);
    if (m.has(ck)) return m.get(ck);
  }
  return "";
}

/**
 * Converte uma linha do `sheet_to_json` (chaves = cabeçalhos da planilha) em `LinhaPlanilhaBruta`.
 * Cabeçalhos esperados (flexíveis): Status, Data, Hora Início, Hora Fim, Paciente, Profissional,
 * Sala, Procedimento(s), Observações, Valor, Valor Total.
 */
export function objetoPlanilhaParaLinhaBruta(
  obj: Record<string, unknown>,
  numeroLinha: number,
): LinhaPlanilhaBruta {
  const m = indexarLinhaPlanilha(obj);
  return {
    numeroLinha,
    status: getCel(m, "status"),
    data: getCel(m, "data"),
    horaInicio: getCel(
      m,
      "horainício",
      "horainicio",
      "hora início",
      "hora inicio",
      "horário início",
      "horario inicio",
    ),
    horaFim: getCel(
      m,
      "horafim",
      "hora fim",
      "horário fim",
      "horario fim",
      "horafím",
    ),
    paciente: getCel(m, "paciente"),
    profissional: getCel(m, "profissional"),
    sala: getCel(m, "sala"),
    procedimentos: getCel(
      m,
      "procedimento(s)",
      "procedimentos",
      "procedimento",
    ),
    observacoes: getCel(m, "observações", "observacoes", "observação", "obs"),
    valor: getCel(m, "valor"),
    valorTotal: getCel(m, "valortotal", "valor total", "total"),
  };
}
