import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

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
      "id, usuario, email, ativo, id_grupo_usuarios, usuarios_grupos:usuarios_grupos!usuarios_id_grupo_usuarios_fkey(id, grupo_usuarios)",
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
    senha?: string;
    email?: string | null;
    id_grupo_usuarios?: number;
    id_empresa?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const usuario = body.usuario?.trim();
  const senha = body.senha?.trim();
  const email = body.email?.trim() || null;
  const idGrupo = Number(body.id_grupo_usuarios);
  const idEmpresaAlvo = Number(body.id_empresa);

  if (!usuario) {
    return NextResponse.json({ error: "Informe o usuário." }, { status: 400 });
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

  const senhaHash = await bcrypt.hash(senha, 10);
  const { data, error } = await supabase
    .from("usuarios")
    .insert({
      usuario,
      senha_hash: senhaHash,
      email,
      id_empresa: idEmpresaAlvo,
      id_grupo_usuarios: idGrupo,
      ativo: true,
    })
    .select("id, usuario, email, ativo, id_grupo_usuarios")
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
