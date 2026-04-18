import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  isCpfLengthOk,
  normalizeCpfDigits,
  PACIENTE_ESTADOS_CIVIS,
  PACIENTE_GENEROS,
} from "@/lib/pacientes";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function optString(v: unknown): string | null {
  if (v === null || typeof v === "undefined") return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function inList<T extends string>(val: string | null, list: readonly T[]): val is T {
  return val !== null && (list as readonly string[]).includes(val);
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: {
    cpf?: string;
    nome_completo?: string | null;
    nome_social?: string | null;
    usar_nome_social?: boolean;
    genero?: string | null;
    data_nascimento?: string | null;
    estado_civil?: string | null;
    email?: string | null;
    telefone?: string;
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    ativo?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const definedKeys = (
    Object.entries(body) as [string, unknown][]
  ).filter(([, v]) => typeof v !== "undefined").map(([k]) => k);
  const isSomenteStatus =
    definedKeys.length === 1 && definedKeys[0] === "ativo" && typeof body.ativo === "boolean";

  const supabase = createAdminClient();

  const { data: existe, error: checkErr } = await supabase
    .from("pacientes")
    .select("id")
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .maybeSingle();
  if (checkErr) {
    console.error(checkErr);
    return NextResponse.json({ error: checkErr.message }, { status: 500 });
  }
  if (!existe) {
    return NextResponse.json({ error: "Paciente não encontrado." }, { status: 404 });
  }

  if (isSomenteStatus) {
    const { data, error } = await supabase
      .from("pacientes")
      .update({ ativo: body.ativo })
      .eq("id", id)
      .eq("id_empresa", empresaId)
      .select(
        "id, cpf, nome_completo, nome_social, genero, data_nascimento, estado_civil, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, ativo",
      )
      .maybeSingle();
    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Paciente não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ data });
  }

  let cpfRaw = "";
  if (body.cpf !== undefined && body.cpf !== null) {
    cpfRaw = String(body.cpf).trim();
  }
  let cpfVal: string | null = null;
  if (cpfRaw !== "") {
    const cpfDigits = normalizeCpfDigits(cpfRaw);
    if (!isCpfLengthOk(cpfDigits)) {
      return NextResponse.json(
        { error: "Informe um CPF válido (11 dígitos) ou deixe em branco." },
        { status: 400 },
      );
    }
    cpfVal = cpfDigits;
  }

  const telefone = optString(body.telefone);

  const usarNomeSocial = Boolean(body.usar_nome_social);
  const nomeCompleto = optString(body.nome_completo);
  const nomeSocial = optString(body.nome_social);

  if (usarNomeSocial) {
    if (!nomeSocial) {
      return NextResponse.json(
        { error: "Informe o nome social." },
        { status: 400 },
      );
    }
  } else if (!nomeCompleto) {
    return NextResponse.json(
      { error: "Informe o nome completo." },
      { status: 400 },
    );
  }

  const genero = optString(body.genero);
  if (genero && !inList(genero, PACIENTE_GENEROS)) {
    return NextResponse.json({ error: "Gênero inválido." }, { status: 400 });
  }

  const estadoCivil = optString(body.estado_civil);
  if (estadoCivil && !inList(estadoCivil, PACIENTE_ESTADOS_CIVIS)) {
    return NextResponse.json(
      { error: "Estado civil inválido." },
      { status: 400 },
    );
  }

  let dataNascimento: string | null = null;
  if (body.data_nascimento === null || body.data_nascimento === "") {
    dataNascimento = null;
  } else if (
    body.data_nascimento !== undefined &&
    typeof body.data_nascimento === "string" &&
    body.data_nascimento.trim()
  ) {
    dataNascimento = body.data_nascimento.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)) {
      return NextResponse.json(
        { error: "Data de nascimento inválida." },
        { status: 400 },
      );
    }
  }

  const uf = optString(body.uf);
  if (uf && uf.length !== 2) {
    return NextResponse.json(
      { error: "UF deve ter 2 letras." },
      { status: 400 },
    );
  }

  const patch = {
    cpf: cpfVal,
    nome_completo: usarNomeSocial ? null : nomeCompleto,
    nome_social: usarNomeSocial ? nomeSocial : null,
    genero,
    data_nascimento: dataNascimento,
    estado_civil: estadoCivil,
    email: optString(body.email),
    telefone,
    cep: optString(body.cep),
    logradouro: optString(body.logradouro),
    numero: optString(body.numero),
    complemento: optString(body.complemento),
    bairro: optString(body.bairro),
    cidade: optString(body.cidade),
    uf: uf ? uf.toUpperCase() : null,
  };

  const { data, error } = await supabase
    .from("pacientes")
    .update(patch)
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .select(
      "id, cpf, nome_completo, nome_social, genero, data_nascimento, estado_civil, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, ativo",
    )
    .maybeSingle();

  if (error) {
    console.error(error);
    if (error.code === "23505") {
      return NextResponse.json(
        {
          error:
            "Já existe um paciente com este CPF ou nome completo nesta empresa.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Paciente não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ data });
}
