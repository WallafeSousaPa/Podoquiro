import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

type CnpjFonte = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  email?: string | null;
  ddd_telefone_1?: string;
  cep?: string;
  descricao_tipo_de_logradouro?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  descricao_situacao_cadastral?: string;
  message?: string;
};

type RouteContext = { params: Promise<{ cnpj: string }> };

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function texto(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim();
}

function montarResposta(cnpj: string, data: CnpjFonte) {
  const razao = texto(data.razao_social);
  const fantasia = texto(data.nome_fantasia);
  const tipoLog = texto(data.descricao_tipo_de_logradouro);
  const logradouro = texto(data.logradouro);
  const endereco = [tipoLog, logradouro].filter(Boolean).join(" ");
  if (!razao && !fantasia) return null;
  return {
    cnpj,
    razao_social: razao,
    nome_fantasia: fantasia,
    nome: fantasia || razao,
    email: texto(data.email),
    telefone: soDigitos(data.ddd_telefone_1 ?? "").slice(0, 11),
    cep: soDigitos(data.cep ?? "").slice(0, 8),
    endereco,
    numero: texto(data.numero),
    complemento: texto(data.complemento),
    bairro: texto(data.bairro),
    municipio: texto(data.municipio),
    uf: texto(data.uf).toUpperCase().slice(0, 2),
    situacao: texto(data.descricao_situacao_cadastral),
  };
}

const FONTES = [
  (cnpj: string) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
  (cnpj: string) => `https://minhareceita.org/${cnpj}`,
];

async function consultarFonte(url: string): Promise<{
  status: number;
  data: CnpjFonte;
}> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Podoquiro/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as CnpjFonte;
  return { status: res.status, data };
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { cnpj: cnpjParam } = await context.params;
  const cnpj = soDigitos(cnpjParam ?? "");
  if (cnpj.length !== 14) {
    return NextResponse.json(
      { error: "Informe um CNPJ com 14 dígitos." },
      { status: 400 },
    );
  }

  let ultimoStatus = 502;
  for (const urlDe of FONTES) {
    try {
      const { status, data } = await consultarFonte(urlDe(cnpj));
      ultimoStatus = status;
      if (status === 404) continue;
      if (status === 429) continue;
      if (!status || status >= 400) continue;
      const body = montarResposta(cnpj, data);
      if (body) return NextResponse.json(body);
    } catch (e) {
      console.error(e);
    }
  }

  if (ultimoStatus === 404) {
    return NextResponse.json({ error: "CNPJ não encontrado." }, { status: 404 });
  }
  if (ultimoStatus === 429) {
    return NextResponse.json(
      { error: "Consulta de CNPJ temporariamente limitada. Tente novamente em instantes." },
      { status: 429 },
    );
  }

  return NextResponse.json(
    { error: "Serviço de CNPJ indisponível. Tente novamente." },
    { status: 502 },
  );
}
