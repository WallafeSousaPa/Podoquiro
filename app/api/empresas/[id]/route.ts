import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: {
    nome_fantasia?: string;
    razao_social?: string;
    cnpj_cpf?: string;
    cep?: string | null;
    endereco?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
    id_empresa_grupo?: number;
    ativo?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const patch: Record<string, string | number | boolean | null> = {};
  if (typeof body.nome_fantasia === "string") {
    const v = body.nome_fantasia.trim();
    if (!v) {
      return NextResponse.json(
        { error: "Nome fantasia inválido." },
        { status: 400 },
      );
    }
    patch.nome_fantasia = v;
  }
  if (typeof body.razao_social === "string") {
    const v = body.razao_social.trim();
    if (!v) {
      return NextResponse.json(
        { error: "Razão social inválida." },
        { status: 400 },
      );
    }
    patch.razao_social = v;
  }
  if (typeof body.cnpj_cpf === "string") {
    const v = body.cnpj_cpf.trim();
    if (!v) {
      return NextResponse.json({ error: "CPF/CNPJ inválido." }, { status: 400 });
    }
    patch.cnpj_cpf = v;
  }
  if (typeof body.cep === "string") patch.cep = body.cep.trim() || null;
  if (typeof body.endereco === "string") patch.endereco = body.endereco.trim() || null;
  if (typeof body.numero === "string") patch.numero = body.numero.trim() || null;
  if (typeof body.complemento === "string") {
    patch.complemento = body.complemento.trim() || null;
  }
  if (typeof body.bairro === "string") patch.bairro = body.bairro.trim() || null;
  if (typeof body.cidade === "string") patch.cidade = body.cidade.trim() || null;
  if (typeof body.estado === "string") patch.estado = body.estado.trim() || null;
  if (typeof body.ativo === "boolean") patch.ativo = body.ativo;

  if (typeof body.id_empresa_grupo !== "undefined") {
    const idGrupo = Number(body.id_empresa_grupo);
    if (!Number.isFinite(idGrupo) || idGrupo <= 0) {
      return NextResponse.json(
        { error: "Selecione um grupo de empresas válido." },
        { status: 400 },
      );
    }
    patch.id_empresa_grupo = idGrupo;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Nada para atualizar." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  if (typeof patch.id_empresa_grupo === "number") {
    const { data: grupoAtivo, error: grupoError } = await supabase
      .from("empresa_grupos")
      .select("id")
      .eq("id", patch.id_empresa_grupo)
      .eq("ativo", true)
      .maybeSingle();
    if (grupoError) {
      console.error(grupoError);
      return NextResponse.json({ error: grupoError.message }, { status: 500 });
    }
    if (!grupoAtivo) {
      return NextResponse.json(
        { error: "Grupo de empresas inválido ou inativo." },
        { status: 400 },
      );
    }
  }

  const { data, error } = await supabase
    .from("empresas")
    .update(patch)
    .eq("id", id)
    .select(
      "id, nome_fantasia, razao_social, cnpj_cpf, cep, endereco, numero, complemento, bairro, cidade, estado, id_empresa_grupo, ativo",
    )
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  return NextResponse.json({ data });
}
