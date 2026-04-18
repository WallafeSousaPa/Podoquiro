import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

type ViaCepJson = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

type RouteContext = { params: Promise<{ cep: string }> };

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { cep: cepParam } = await context.params;
  const cep = onlyDigits(cepParam ?? "");
  if (cep.length !== 8) {
    return NextResponse.json(
      { error: "Informe um CEP com 8 dígitos." },
      { status: 400 },
    );
  }

  let data: ViaCepJson;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Serviço de CEP indisponível. Tente novamente." },
        { status: 502 },
      );
    }
    data = (await res.json()) as ViaCepJson;
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Não foi possível consultar o CEP." },
      { status: 502 },
    );
  }

  if (data.erro === true || !data.localidade || !data.uf) {
    return NextResponse.json({ error: "CEP não encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    cep: data.cep ?? cep,
    logradouro: data.logradouro ?? "",
    complemento: data.complemento ?? "",
    bairro: data.bairro ?? "",
    cidade: data.localidade,
    uf: data.uf,
  });
}
