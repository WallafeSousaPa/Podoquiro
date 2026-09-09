export type ViaCepEndereco = {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  /** Código IBGE do município (7 dígitos). */
  ibge: string;
};

type ViaCepJson = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  erro?: boolean;
};

function apenasDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function normalizarNomeCidade(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** Fallback quando o ViaCEP falha — municípios mais comuns no Pará. */
const IBGE_PA_POR_CIDADE: Record<string, string> = {
  altamira: "1500602",
  belem: "1501402",
  ananindeua: "1500800",
  maraba: "1504208",
  santarem: "1506807",
  parauapebas: "1505536",
  castanhal: "1502400",
};

export function ibgePorNomeCidade(cidade: string | null | undefined): string | null {
  if (!cidade?.trim()) return null;
  return IBGE_PA_POR_CIDADE[normalizarNomeCidade(cidade)] ?? null;
}

export async function consultarViaCep(cepRaw: string): Promise<ViaCepEndereco | null> {
  const cep = apenasDigitos(cepRaw);
  if (cep.length !== 8) return null;

  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as ViaCepJson;
  if (data.erro === true || !data.localidade || !data.uf) return null;

  const ibge = (data.ibge ?? "").replace(/\D/g, "");
  if (ibge.length !== 7) return null;

  return {
    cep,
    logradouro: data.logradouro ?? "",
    bairro: data.bairro ?? "",
    cidade: data.localidade,
    uf: data.uf,
    ibge,
  };
}

/** IBGE do município do tomador: ViaCEP pelo CEP, senão nome da cidade. */
export async function ibgeMunicipioTomador(params: {
  cep: string;
  cidade?: string | null;
}): Promise<string | null> {
  try {
    const via = await consultarViaCep(params.cep);
    if (via?.ibge) return via.ibge;
  } catch {
    /* fallback pelo nome da cidade */
  }
  return ibgePorNomeCidade(params.cidade);
}
