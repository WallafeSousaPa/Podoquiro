/** Normaliza texto para comparação de nomes (planilha × cadastro). */
export function normalizarNomePlanilha(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const STATUS_ALIASES: Record<string, string> = {
  pendente: "pendente",
  confirmado: "confirmado",
  confirmada: "confirmado",
  /** Planilha: mesmo significado de confirmado no sistema. */
  agendado: "confirmado",
  /** Ex.: "Curativo agendado" na planilha. */
  curativoagendado: "confirmado",
  emandamento: "em_andamento",
  "em andamento": "em_andamento",
  em_atendimento: "em_andamento",
  realizado: "realizado",
  realizada: "realizado",
  concluido: "realizado",
  concluída: "realizado",
  /** Planilhas legadas / externos: equivale a `realizado` no banco. */
  atendido: "realizado",
  finalizado: "realizado",
  cancelado: "cancelado",
  cancelada: "cancelado",
  /** "Não atendido" → normalizado sem acento + compacto. */
  naoatendido: "cancelado",
  adiado: "adiado",
  adiada: "adiado",
  faltou: "faltou",
  falta: "faltou",
};

const STATUS_VALIDOS = new Set([
  "pendente",
  "confirmado",
  "em_andamento",
  "realizado",
  "cancelado",
  "faltou",
  "adiado",
]);

/** Converte texto da planilha em `agendamento_status` ou null. */
export function parseStatusPlanilha(raw: unknown): string | null {
  const t = normalizarNomePlanilha(String(raw ?? ""));
  if (!t) return null;
  const compact = t.replace(/[^a-z0-9]/g, "");
  if (STATUS_VALIDOS.has(t)) return t;
  const via = STATUS_ALIASES[compact] ?? STATUS_ALIASES[t];
  if (via && STATUS_VALIDOS.has(via)) return via;
  return null;
}

/** Converte número serial do Excel (dias desde 1899-12-30) em partes UTC da data civil. */
export function excelSerialParaYmd(serial: number): { y: number; m: number; d: number } | null {
  if (!Number.isFinite(serial)) return null;
  const utc = Math.round((serial - 25569) * 86400 * 1000);
  const dt = new Date(utc);
  if (Number.isNaN(dt.getTime())) return null;
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Interpreta célula de data: serial Excel, ISO, dd/mm/aaaa, etc. */
export function parseDataCivilPlanilha(raw: unknown): { y: number; m: number; d: number } | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return excelSerialParaYmd(raw);
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return { y: raw.getFullYear(), m: raw.getMonth() + 1, d: raw.getDate() };
  }
  const s = String(raw).trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return { y, m, d };
  }
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (br) {
    const d = Number(br[1]);
    const m = Number(br[2]);
    const y = Number(br[3]);
    if (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return { y, m, d };
  }
  return null;
}

/** Hora como "8", "8:30", "08:30:00", número fração do dia Excel, etc. */
export function parseHoraPlanilha(raw: unknown): { h: number; min: number; s: number } | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 0 && raw < 1) {
      const totalMin = Math.round(raw * 24 * 60);
      const h = Math.floor(totalMin / 60);
      const min = totalMin % 60;
      return { h, min, s: 0 };
    }
    if (raw >= 0 && raw < 24) {
      return { h: Math.floor(raw), min: Math.round((raw % 1) * 60), s: 0 };
    }
  }
  const s = String(raw).trim();
  if (!s) return null;
  const m = /^(\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] != null ? Number(m[2]) : 0;
  const sec = m[3] != null ? Number(m[3]) : 0;
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  if (!Number.isFinite(min) || min < 0 || min > 59) return null;
  if (!Number.isFinite(sec) || sec < 0 || sec > 59) return null;
  return { h, min, s: sec };
}

/**
 * Combina data + hora em ISO UTC a partir de componentes civis interpretados no fuso local do navegador/servidor.
 * Para importação em massa, usamos construção local (mesma ideia do modal da agenda no cliente).
 */
export function combinarDataHoraLocalIso(
  data: { y: number; m: number; d: number },
  hora: { h: number; min: number; s: number },
): string | null {
  const d = new Date(data.y, data.m - 1, data.d, hora.h, hora.min, hora.s, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Valor monetário na planilha (número ou texto pt-BR). */
export function parseDecimalPlanilha(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw >= 0 ? Math.round(raw * 100) / 100 : null;
  }
  const s = String(raw)
    .trim()
    .replace(/\s/g, "")
    .replace(/R\$\s*/i, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let norm: string;
  if (lastComma !== -1 && lastComma > lastDot) {
    norm = s.replace(/\./g, "").replace(",", ".");
  } else {
    norm = s.replace(/,/g, "");
  }
  const n = Number(norm);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Remove caracteres invisíveis e normaliza espaços na célula de valor (Excel às vezes insere ZWSP/NBSP). */
function normalizarTextoCelulaValorImport(s: string): string {
  return s
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\u202F/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Extrai trechos monetários em ordem: `R$20 R$20 R$201`, `20 30 R$40`, `R$ 1.234,56`.
 * Retorna `null` se houver texto não reconhecido após os valores (fallback para split legado).
 */
function extrairTrechosValoresMonetariosPlanilha(s: string): string[] | null {
  const t = normalizarTextoCelulaValorImport(s);
  if (!t) return [];
  const trechos: string[] = [];
  let i = 0;
  while (i < t.length) {
    while (i < t.length && t[i] === " ") i++;
    if (i >= t.length) break;

    const start = i;
    let digitStart: number;

    if (t.slice(i, i + 2).toLowerCase() === "r$") {
      digitStart = i + 2;
      while (digitStart < t.length && t[digitStart] === " ") digitStart++;
      if (digitStart >= t.length || t[digitStart] < "0" || t[digitStart] > "9") return null;
    } else if (t[i] >= "0" && t[i] <= "9") {
      digitStart = i;
    } else {
      return null;
    }

    let j = digitStart;
    while (j < t.length && /[0-9.,]/.test(t[j])) j++;
    if (j === digitStart) return null;
    trechos.push(t.slice(start, j));
    i = j;
  }
  return trechos;
}

/**
 * Junta tokens após split por espaço: "R$" + "120,00" → "R$ 120,00".
 * Aceita também "R$120,00" como token único.
 */
function mergeValorTokensPlanilha(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^R\$/i.test(t) && t.length <= 2) {
      const next = tokens[i + 1];
      if (next != null) {
        out.push(`${t} ${next}`);
        i++;
      } else {
        out.push(t);
      }
    } else {
      out.push(t);
    }
  }
  return out;
}

/**
 * Vários valores na coluna Valor, separados por espaço (ex.: `R$ 120,00 R$ 200,00`).
 * Célula vazia → `[0]`. Um número Excel → um elemento. Texto inválido → null.
 */
export function parseListaValoresMonetariosPlanilha(raw: unknown): number[] | null {
  if (raw == null) return [0];
  if (raw === "") return [0];
  if (typeof raw === "string" && raw.trim() === "") return [0];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw >= 0 ? [Math.round(raw * 100) / 100] : null;
  }

  const texto = normalizarTextoCelulaValorImport(String(raw));
  if (!texto) return [0];

  const trechosScanner = extrairTrechosValoresMonetariosPlanilha(texto);
  if (trechosScanner != null && trechosScanner.length > 0) {
    const valores: number[] = [];
    for (const frag of trechosScanner) {
      const n = parseDecimalPlanilha(frag);
      if (n == null) return null;
      valores.push(n);
    }
    return valores;
  }

  const tokens = texto
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x !== "");
  if (tokens.length === 0) return [0];
  const merged = mergeValorTokensPlanilha(tokens);
  const valoresLegacy: number[] = [];
  for (const m of merged) {
    const n = parseDecimalPlanilha(m);
    if (n == null) return null;
    valoresLegacy.push(n);
  }
  return valoresLegacy;
}

/**
 * Soma dos valores da coluna Valor (um ou vários, separados por espaço).
 * Célula vazia = 0. Texto inválido → null.
 */
export function parseValorMonetarioImportacao(raw: unknown): number | null {
  const lista = parseListaValoresMonetariosPlanilha(raw);
  if (lista == null) return null;
  return Math.round(lista.reduce((s, v) => s + v, 0) * 100) / 100;
}

/** Divide nomes de procedimentos na célula "Procedimento(s)". */
export function splitNomesProcedimentosPlanilha(raw: unknown): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  return s
    .split(/[\n\r;|,/]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Linhas da planilha sem nenhum procedimento são ignoradas na importação. */
export function linhaPlanilhaTemProcedimentos(raw: unknown): boolean {
  return splitNomesProcedimentosPlanilha(raw).length > 0;
}

export type CampoPendenciaImport =
  | "status"
  | "data_hora_inicio"
  | "data_hora_fim"
  | "paciente"
  | "profissional"
  | "sala"
  | "procedimento"
  | "valor"
  | "valor_total";

export type PendenciaImport = {
  campo: CampoPendenciaImport;
  /** Índice do token de procedimento quando `campo === "procedimento"`. */
  indiceProcedimento?: number;
  textoPlanilha: string;
  mensagem: string;
};
