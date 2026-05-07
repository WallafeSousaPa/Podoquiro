import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isCpfLengthOk, normalizeCpfDigits } from "@/lib/pacientes";
import { createAdminClient } from "@/lib/supabase/admin";

const HEX_COR_RE = /^#[0-9A-Fa-f]{6}$/;

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("usuarios")
    .select(
      "id, usuario, nome_completo, cpf, email, ativo, id_grupo_usuarios, exibir_na_agenda, card_cor, usuarios_grupos:usuarios_grupos!usuarios_id_grupo_usuarios_fkey(id, grupo_usuarios)",
    )
    .eq("id_empresa", empresaId)
    .order("usuario", { ascending: true });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let body: {
    usuario?: string;
    nome_completo?: string;
    cpf?: string;
    senha?: string;
    email?: string | null;
    id_grupo_usuarios?: number;
    id_empresa?: number;
    exibir_na_agenda?: boolean;
    card_cor?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const usuario = body.usuario?.trim();
  const nomeCompleto =
    typeof body.nome_completo === "string" ? body.nome_completo.trim() : "";
  const cpfDigits = normalizeCpfDigits(
    typeof body.cpf === "string" ? body.cpf : "",
  );
  const senha = body.senha?.trim();
  const email = body.email?.trim() || null;
  const idGrupo = Number(body.id_grupo_usuarios);
  const idEmpresaAlvo = Number(body.id_empresa);

  if (!usuario) {
    return NextResponse.json({ error: "Informe o usuário." }, { status: 400 });
  }
  if (!nomeCompleto) {
    return NextResponse.json(
      { error: "Informe o nome completo." },
      { status: 400 },
    );
  }
  if (!isCpfLengthOk(cpfDigits)) {
    return NextResponse.json(
      { error: "Informe um CPF válido (11 dígitos)." },
      { status: 400 },
    );
  }
  if (!senha) {
    return NextResponse.json({ error: "Informe a senha." }, { status: 400 });
  }
  if (!Number.isFinite(idGrupo) || idGrupo <= 0) {
    return NextResponse.json(
      { error: "Selecione um grupo de usuários." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(idEmpresaAlvo) || idEmpresaAlvo <= 0) {
    return NextResponse.json({ error: "Selecione uma empresa." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: empresaOk, error: empresaError } = await supabase
    .from("empresas")
    .select("id")
    .eq("id", idEmpresaAlvo)
    .eq("ativo", true)
    .maybeSingle();
  if (empresaError) {
    console.error(empresaError);
    return NextResponse.json({ error: empresaError.message }, { status: 500 });
  }
  if (!empresaOk) {
    return NextResponse.json(
      { error: "Empresa inválida ou inativa." },
      { status: 400 },
    );
  }

  const { data: grupoAtivo, error: grupoError } = await supabase
    .from("usuarios_grupos")
    .select("id")
    .eq("id", idGrupo)
    .eq("ativo", true)
    .maybeSingle();
  if (grupoError) {
    console.error(grupoError);
    return NextResponse.json({ error: grupoError.message }, { status: 500 });
  }
  if (!grupoAtivo) {
    return NextResponse.json(
      { error: "Grupo de usuários inválido ou inativo." },
      { status: 400 },
    );
  }

  const exibirNaAgenda =
    typeof body.exibir_na_agenda === "boolean" ? body.exibir_na_agenda : false;
  const cardCorRaw = typeof body.card_cor === "string" ? body.card_cor.trim() : "";
  const cardCor = cardCorRaw === "" ? null : cardCorRaw.toUpperCase();
  if (cardCor !== null && !HEX_COR_RE.test(cardCor)) {
    return NextResponse.json(
      { error: "A cor do card deve estar no formato HEX #RRGGBB." },
      { status: 400 },
    );
  }

  const senhaHash = await bcrypt.hash(senha, 10);
  const { data, error } = await supabase
    .from("usuarios")
    .insert({
      usuario,
      nome_completo: nomeCompleto,
      cpf: cpfDigits,
      senha_hash: senhaHash,
      email,
      id_empresa: idEmpresaAlvo,
      id_grupo_usuarios: idGrupo,
      ativo: true,
      exibir_na_agenda: exibirNaAgenda,
      card_cor: cardCor,
    })
    .select(
      "id, usuario, nome_completo, cpf, email, ativo, id_grupo_usuarios, exibir_na_agenda, card_cor",
    )
    .single();

  if (error) {
    console.error(error);
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Já existe um usuário com este CPF nesta empresa." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
