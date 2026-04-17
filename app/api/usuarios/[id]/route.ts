import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
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
    usuario?: string;
    email?: string | null;
    senha?: string;
    id_grupo_usuarios?: number;
    ativo?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const patch: Record<string, string | number | boolean | null> = {};
  if (typeof body.usuario === "string") {
    const usuario = body.usuario.trim();
    if (!usuario) {
      return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
    }
    patch.usuario = usuario;
  }
  if (typeof body.email === "string") {
    patch.email = body.email.trim() || null;
  }
  if (typeof body.ativo === "boolean") {
    patch.ativo = body.ativo;
  }
  if (typeof body.id_grupo_usuarios !== "undefined") {
    const idGrupo = Number(body.id_grupo_usuarios);
    if (!Number.isFinite(idGrupo) || idGrupo <= 0) {
      return NextResponse.json(
        { error: "Selecione um grupo de usuários válido." },
        { status: 400 },
      );
    }
    patch.id_grupo_usuarios = idGrupo;
  }
  if (typeof body.senha === "string" && body.senha.trim()) {
    patch.senha_hash = await bcrypt.hash(body.senha.trim(), 10);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Nada para atualizar." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  if (typeof patch.id_grupo_usuarios === "number") {
    const { data: grupoAtivo, error: grupoError } = await supabase
      .from("usuarios_grupos")
      .select("id")
      .eq("id", patch.id_grupo_usuarios)
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
  }

  const { data, error } = await supabase
    .from("usuarios")
    .update(patch)
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .select("id, usuario, email, ativo, id_grupo_usuarios")
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ data });
}
