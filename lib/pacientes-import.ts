import * as XLSX from "xlsx";
import {
  isCpfLengthOk,
  normalizeCpfDigits,
  PACIENTE_ESTADOS_CIVIS,
  PACIENTE_GENEROS,
} from "@/lib/pacientes";

/** Colunas esperadas na planilha (primeira linha). Aceita também o alias nome_cliente → nome_completo. */
export const COLUNAS_PLANILHA_PACIENTES = [
  "nome_completo",
  "data_nascimento",
  "genero",
  "cpf",
  "estado_civil",
  "cep",
  "uf",
  "cidade",
  "logradouro",
  "bairro",
  "numero",
  "complemento",
  "email",
  "telefone",
] as const;

export type LinhaPacienteImport = {
  nome_completo: string;
  data_nascimento: string | null;
  genero: string | null;
  cpf: string | null;
  estado_civil: string | null;
  cep: string | null;
  uf: string | null;
  cidade: string | null;
  logradouro: string | null;
  bairro: string | null;
  numero: string | null;
  complemento: string | null;
  email: string | null;
  telefone: string | null;
};

export type IgnoradoImport = { linha: number; motivo: string };

function canonicalKey(k: string): string {
  const n = k.trim().toLowerCase().replace(/\s+/g, "_");
  if (n === "nome_cliente") return "nome_completo";
  return n;
}

function optCell(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "number" && !Number.isNaN(v)) {
    if (Number.isInteger(v) && Math.abs(v) > 1e6) return String(v);
    return String(v).trim() || null;
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  return s === "" ? null : s;
}

function parseData(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed && typeof parsed.y === "number") {
      const mm = Math.max(1, Math.min(12, parsed.m ?? 1));
      const dd = Math.max(1, Math.min(31, parsed.d ?? 1));
      const d = new Date(Date.UTC(parsed.y, mm - 1, dd));
      return d.toISOString().slice(0, 10);
    }
  }
  const s = optCell(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (br) {
    const dd = br[1].padStart(2, "0");
    const mm = br[2].padStart(2, "0");
    const yyyy = br[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function inList<T extends string>(val: string | null, list: readonly T[]): val is T {
  return val !== null && (list as readonly string[]).includes(val);
}

function normalizeRow(raw: Record<string, unknown>): LinhaPacienteImport | null {
  const get = (key: string): unknown => {
    for (const [k, val] of Object.entries(raw)) {
      if (canonicalKey(k) === key) return val;
    }
    return undefined;
  };

  const nomeRaw = optCell(get("nome_completo"));
  if (!nomeRaw) return null;

  let genero = optCell(get("genero"));
  if (genero && !inList(genero, PACIENTE_GENEROS)) genero = null;

  let estadoCivil = optCell(get("estado_civil"));
  if (estadoCivil && !inList(estadoCivil, PACIENTE_ESTADOS_CIVIS)) estadoCivil = null;

  const cpfRaw = optCell(get("cpf"));
  let cpf: string | null = null;
  if (cpfRaw) {
    const d = normalizeCpfDigits(cpfRaw);
    if (isCpfLengthOk(d)) cpf = d;
  }

  const ufRaw = optCell(get("uf"));
  const uf = ufRaw ? ufRaw.toUpperCase().slice(0, 2) : null;

  return {
    nome_completo: nomeRaw,
    data_nascimento: parseData(get("data_nascimento")),
    genero,
    cpf,
    estado_civil: estadoCivil,
    cep: optCell(get("cep")),
    uf: uf && uf.length === 2 ? uf : null,
    cidade: optCell(get("cidade")),
    logradouro: optCell(get("logradouro")),
    bairro: optCell(get("bairro")),
    numero: optCell(get("numero")),
    complemento: optCell(get("complemento")),
    email: optCell(get("email")),
    telefone: optCell(get("telefone")),
  };
}

/** CPF preenchido mas inválido → linha inválida */
export function cpfInvalidoNaLinha(raw: Record<string, unknown>): boolean {
  const get = (key: string): unknown => {
    for (const [k, val] of Object.entries(raw)) {
      if (canonicalKey(k) === key) return val;
    }
    return undefined;
  };
  const cpfRaw = optCell(get("cpf"));
  if (!cpfRaw) return false;
  const d = normalizeCpfDigits(cpfRaw);
  return d.length > 0 && !isCpfLengthOk(d);
}

function stripUtf8Bom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

/** Detecta se o CSV usa vírgula (padrão EN) ou ponto e vírgula (comum no Excel em PT-BR). */
function detectarSeparadorCsv(primeiraLinha: string): "," | ";" {
  const virgulas = (primeiraLinha.match(/,/g) ?? []).length;
  const pontoVirgula = (primeiraLinha.match(/;/g) ?? []).length;
  return pontoVirgula > virgulas ? ";" : ",";
}

function bufferParaLinhasJson(
  buffer: Buffer,
  filename: string,
): { rows: Record<string, unknown>[]; erro?: string } {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    let text = stripUtf8Bom(buffer.toString("utf8"));
    if (!text.trim()) {
      return { rows: [], erro: "Arquivo CSV vazio." };
    }
    const firstNl = text.search(/\r?\n/);
    const primeiraLinha = firstNl === -1 ? text : text.slice(0, firstNl);
    const fs = detectarSeparadorCsv(primeiraLinha);
    const wb = XLSX.read(text, { type: "string", cellDates: true, raw: true, FS: fs });
    const name = wb.SheetNames[0];
    if (!name) {
      return { rows: [], erro: "Não foi possível ler o CSV." };
    }
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: null,
      raw: true,
    });
    return { rows };
  }

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], erro: "Planilha vazia." };
  }
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: null,
    raw: true,
  });
  return { rows };
}

/** Importa pacientes a partir de CSV (valores separados por vírgula do Excel) ou .xlsx / .xls. */
export function parseArquivoImportPacientes(
  buffer: Buffer,
  filename: string,
): {
  linhas: { indicePlanilha: number; dados: LinhaPacienteImport }[];
  ignorados: IgnoradoImport[];
} {
  const { rows, erro } = bufferParaLinhasJson(buffer, filename);
  if (erro && rows.length === 0) {
    return { linhas: [], ignorados: [{ linha: 0, motivo: erro }] };
  }

  const linhas: { indicePlanilha: number; dados: LinhaPacienteImport }[] = [];
  const ignorados: IgnoradoImport[] = [];

  rows.forEach((raw, i) => {
    const linhaNum = i + 2;
    if (!raw || typeof raw !== "object") {
      ignorados.push({ linha: linhaNum, motivo: "Linha vazia ou inválida." });
      return;
    }
    if (cpfInvalidoNaLinha(raw)) {
      ignorados.push({ linha: linhaNum, motivo: "CPF preenchido mas inválido (use 11 dígitos)." });
      return;
    }
    const dados = normalizeRow(raw);
    if (!dados) {
      ignorados.push({ linha: linhaNum, motivo: "Nome (nome_completo / nome_cliente) obrigatório." });
      return;
    }
    if (dados.cpf && !isCpfLengthOk(dados.cpf)) {
      ignorados.push({ linha: linhaNum, motivo: "CPF inválido após normalização." });
      return;
    }
    linhas.push({ indicePlanilha: linhaNum, dados });
  });

  return { linhas, ignorados };
}

/** @deprecated Use parseArquivoImportPacientes com nome do arquivo. */
export function parsePlanilhaPacientes(buffer: Buffer) {
  return parseArquivoImportPacientes(buffer, "import.xlsx");
}

export function chaveNomeNormalizada(nome: string): string {
  return nome.trim().toLowerCase();
}

/** Menor número de linha da planilha onde cada nome (ou CPF) aparece — para manter só a primeira ocorrência. */
export function buildPrimeiraLinhaPorNomeECpf(
  linhas: { indicePlanilha: number; dados: LinhaPacienteImport }[],
): { porNome: Map<string, number>; porCpf: Map<string, number> } {
  const porNome = new Map<string, number>();
  const porCpf = new Map<string, number>();
  for (const { indicePlanilha, dados } of linhas) {
    const nk = chaveNomeNormalizada(dados.nome_completo);
    const prevN = porNome.get(nk);
    if (prevN === undefined || indicePlanilha < prevN) porNome.set(nk, indicePlanilha);
    const c = dados.cpf;
    if (c) {
      const prevC = porCpf.get(c);
      if (prevC === undefined || indicePlanilha < prevC) porCpf.set(c, indicePlanilha);
    }
  }
  return { porNome, porCpf };
}
