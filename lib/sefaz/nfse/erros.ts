/** Campo JSON da Sefin ignorando caixa (`codigo` == `Codigo`). */
export function campoSefin(obj: Record<string, unknown>, nome: string): unknown {
  const alvo = nome.toLowerCase();
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === alvo) return v;
  }
  return undefined;
}

function asTexto(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function listaBrutaErros(json: unknown): unknown[] {
  if (!json || typeof json !== "object") return [];
  const raiz = json as Record<string, unknown>;
  const dataRaw = campoSefin(raiz, "data");
  const data =
    dataRaw && typeof dataRaw === "object" && !Array.isArray(dataRaw)
      ? (dataRaw as Record<string, unknown>)
      : raiz;

  let brutos = campoSefin(data, "erros") ?? campoSefin(data, "erro");
  if (brutos && typeof brutos === "object" && !Array.isArray(brutos)) {
    const vals = campoSefin(brutos as Record<string, unknown>, "$values");
    brutos = Array.isArray(vals) ? vals : [brutos];
  }
  return Array.isArray(brutos) ? brutos : [];
}

const MSG_E0039 =
  "E0039: o município não habilitou o emissor público da Sefin Nacional. " +
  "Em Belém a emissão direta vai para a API municipal (nfseapi.belem.pa.gov.br), sem a Focus.";

export const MSG_L9999_TOMADOR =
  "L9999: CPF/CNPJ do tomador inválido. Confira o CPF no cadastro do paciente " +
  "(11 dígitos, dígitos verificadores corretos) e emita novamente.";

export const MSG_L9999_SCHEMA =
  "L9999: a prefeitura rejeitou o XML da NFS-e (fora do leiaute esperado). Tente emitir novamente.";

export const MSG_L9999_GENERICO =
  "L9999: a prefeitura retornou um erro interno ao processar a NFS-e. Tente emitir novamente. " +
  "Se persistir, o webservice municipal (SEFIN Belém) pode estar instável.";

function mensagemAmigavelSefin(codigo: string | undefined, texto: string): string | null {
  const c = (codigo ?? "").toUpperCase();
  const t = `${c} ${texto}`.toUpperCase();
  if (c === "E0039" || t.includes("EMISSORES PÚBLICOS NACIONAIS") || t.includes("EMISSORES PUBLICOS NACIONAIS")) {
    return MSG_E0039;
  }
  const falaTomador =
    t.includes("CPF/CNPJ TOMADOR") ||
    t.includes("TOMADOR INVÁLIDO") ||
    t.includes("TOMADOR INVALIDO");
  const falaSchema =
    t.includes("XML SCHEMA") ||
    t.includes("XSD") ||
    t.includes("INVALID CONTENT") ||
    t.includes("EM DESACORDO");
  if (falaTomador) return MSG_L9999_TOMADOR;
  if (c === "L9999" && falaSchema) return MSG_L9999_SCHEMA;
  if (c === "L9999") return MSG_L9999_GENERICO;
  return null;
}

export type SefinNfseErroItem = {
  codigo?: string;
  mensagem?: string;
  descricao?: string;
  complemento?: string;
};

export function normalizarErroSefin(e: unknown): SefinNfseErroItem {
  if (typeof e === "string") {
    return { mensagem: e.trim() };
  }
  if (!e || typeof e !== "object") return {};
  const o = e as Record<string, unknown>;
  return {
    codigo: asTexto(campoSefin(o, "codigo")) || undefined,
    mensagem: asTexto(campoSefin(o, "mensagem")) || undefined,
    descricao: asTexto(campoSefin(o, "descricao")) || undefined,
    complemento: asTexto(campoSefin(o, "complemento")) || undefined,
  };
}

export function mensagemDeErroItemSefin(e: unknown): string {
  if (typeof e === "string" && e.trim()) {
    return mensagemAmigavelSefin(undefined, e) ?? e.trim();
  }
  const n = normalizarErroSefin(e);
  const corpo = [n.mensagem ?? n.descricao ?? "", n.complemento ?? ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" — ");
  const amigavel = mensagemAmigavelSefin(n.codigo, corpo);
  if (amigavel) return amigavel;
  if (n.codigo && corpo) return `${n.codigo}: ${corpo}`;
  if (corpo) return corpo;
  if (n.codigo) return n.codigo;
  if (e && typeof e === "object") {
    try {
      const t = JSON.stringify(e);
      if (t && t !== "{}") return t;
    } catch {
      /* ignore */
    }
  }
  return "";
}

export function mensagemErrosSefin(erros: unknown[] | undefined): string | null {
  if (!erros?.length) return null;
  const parts = erros.map(mensagemDeErroItemSefin).filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : null;
}

/** Extrai erros de qualquer formato observado na Sefin (`erros`, `erro`, PascalCase, `$values`). */
export function extrairErrosSefin(json: unknown): SefinNfseErroItem[] {
  return listaBrutaErros(json).map(normalizarErroSefin);
}

export function mensagemErrosSefinDeResposta(json: unknown): string | null {
  const brutos = listaBrutaErros(json);
  if (brutos.length === 0) return null;
  return mensagemErrosSefin(brutos);
}
