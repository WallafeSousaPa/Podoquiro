import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isCpfLengthOk, normalizeCpfDigits } from "@/lib/pacientes";
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
    nome_completo?: string;
    cpf?: string | null;
    email?: string | null;
    senha?: string;
    id_grupo_usuarios?: number;
    id_empresa?: number;
    ativo?: boolean;
    exibir_na_agenda?: boolean;
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
  if (typeof body.nome_completo === "string") {
    const nome = body.nome_completo.trim();
    if (!nome) {
      return NextResponse.json(
        { error: "Nome completo inválido." },
        { status: 400 },
      );
    }
    patch.nome_completo = nome;
  }
  if (typeof body.cpf !== "undefined") {
    if (body.cpf === null || body.cpf === "") {
      patch.cpf = null;
    } else if (typeof body.cpf === "string") {
      const d = normalizeCpfDigits(body.cpf);
      if (!isCpfLengthOk(d)) {
        return NextResponse.json(
          { error: "CPF inválido (informe 11 dígitos ou deixe em branco)." },
          { status: 400 },
        );
      }
      patch.cpf = d;
    } else {
      return NextResponse.json({ error: "CPF inválido." }, { status: 400 });
    }
  }
  if (typeof body.email === "string") {
    patch.email = body.email.trim() || null;
  }
  if (typeof body.ativo === "boolean") {
    patch.ativo = body.ativo;
  }
  if (typeof body.exibir_na_agenda === "boolean") {
    patch.exibir_na_agenda = body.exibir_na_agenda;
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
  if (typeof body.id_empresa !== "undefined") {
    const idEmpresaNovo = Number(body.id_empresa);
    if (!Number.isFinite(idEmpresaNovo) || idEmpresaNovo <= 0) {
      return NextResponse.json(
        { error: "Selecione uma empresa válida." },
        { status: 400 },
      );
    }
    patch.id_empresa = idEmpresaNovo;
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

  if (typeof patch.id_empresa === "number") {
    const { data: empAtiva, error: empErr } = await supabase
      .from("empresas")
      .select("id")
      .eq("id", patch.id_empresa)
      .eq("ativo", true)
      .maybeSingle();
    if (empErr) {
      console.error(empErr);
      return NextResponse.json({ error: empErr.message }, { status: 500 });
    }
    if (!empAtiva) {
      return NextResponse.json(
        { error: "Empresa inválida ou inativa." },
        { status: 400 },
      );
    }
  }

  const { data: pertenceSessao, error: checkErr } = await supabase
    .from("usuarios")
    .select("id")
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .maybeSingle();
  if (checkErr) {
    console.error(checkErr);
    return NextResponse.json({ error: checkErr.message }, { status: 500 });
  }
  if (!pertenceSessao) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("usuarios")
    .update(patch)
    .eq("id", id)
    .select("id, usuario, nome_completo, cpf, email, ativo, id_grupo_usuarios, id_empresa, exibir_na_agenda")
    .maybeSingle();

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
  if (!data) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ data });
}
