const NOME_UF: Record<string, string> = {
  ACRE: "AC",
  ALAGOAS: "AL",
  AMAPA: "AP",
  AMAZONAS: "AM",
  BAHIA: "BA",
  CEARA: "CE",
  "DISTRITO FEDERAL": "DF",
  "ESPIRITO SANTO": "ES",
  GOIAS: "GO",
  MARANHAO: "MA",
  "MATO GROSSO": "MT",
  "MATO GROSSO DO SUL": "MS",
  "MINAS GERAIS": "MG",
  PARA: "PA",
  PARAIBA: "PB",
  PARANA: "PR",
  PERNAMBUCO: "PE",
  PIAUI: "PI",
  "RIO DE JANEIRO": "RJ",
  "RIO GRANDE DO NORTE": "RN",
  "RIO GRANDE DO SUL": "RS",
  RONDONIA: "RO",
  RORAIMA: "RR",
  "SANTA CATARINA": "SC",
  "SAO PAULO": "SP",
  SERGIPE: "SE",
  TOCANTINS: "TO",
};

function semAcentoUpper(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Sigla de UF com 2 letras, ou null. Aceita "PA", "Pará", "PARÁ". */
export function normalizarUfBr(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const key = semAcentoUpper(t);
  if (/^[A-Z]{2}$/.test(key)) return key;
  if (NOME_UF[key]) return NOME_UF[key];
  const letras = key.replace(/[^A-Z]/g, "");
  return letras.slice(0, 2) || null;
}
