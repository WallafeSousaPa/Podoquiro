import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isChaveMenuLateral, usuarioTemMenu } from "@/lib/dashboard/menus-catalogo";
import {
  limparPersonalizacaoUsuario,
  menusDoGrupo,
  menusEfetivosDoUsuario,
  menusPersonalizadosDoUsuario,
  substituirMenusGrupo,
  substituirMenusUsuario,
} from "@/lib/dashboard/menus-permissoes";

async function podeGerenciarMenus(
  supabase: ReturnType<typeof createAdminClient>,
  idUsuario: number,
): Promise<boolean> {
  const efetivo = await menusEfetivosDoUsuario(supabase, idUsuario);
  if (usuarioTemMenu(efetivo.menus, "usuarios.menus")) return true;
  const { count } = await supabase
    .from("menu_permissoes_grupo")
    .select("id_grupo", { count: "exact", head: true });
  if ((count ?? 0) > 0) return false;
  const { data: u } = await supabase
    .from("usuarios")
    .select("usuarios_grupos:usuarios_grupos!usuarios_id_grupo_usuarios_fkey ( grupo_usuarios )")
    .eq("id", idUsuario)
    .maybeSingle();
  type G = { grupo_usuarios: string | null };
  const gRaw = u?.usuarios_grupos as G | G[] | null | undefined;
  const g = Array.isArray(gRaw) ? gRaw[0] : gRaw;
  const nome = (g?.grupo_usuarios ?? "").toLowerCase();
  return nome.includes("admin");
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const sessionUserId = Number(session.sub);
  const supabase = createAdminClient();
  if (!(await podeGerenciarMenus(supabase, sessionUserId))) {
    return NextResponse.json({ error: "Sem permissão para gerenciar menus." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const alvo = searchParams.get("alvo");
  const id = Number(searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Informe o id." }, { status: 400 });
  }

  if (alvo === "grupo") {
    const { data: grupo, error } = await supabase
      .from("usuarios_grupos")
      .select("id, grupo_usuarios")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!grupo) return NextResponse.json({ error: "Tipo de usuário não encontrado." }, { status: 404 });
    const menus = await menusDoGrupo(supabase, id);
    return NextResponse.json({
      alvo: "grupo",
      id,
      nome: grupo.grupo_usuarios,
      menus,
      origem: "grupo",
    });
  }

  if (alvo === "usuario") {
    const { data: u, error } = await supabase
      .from("usuarios")
      .select(
        "id, usuario, nome_completo, id_grupo_usuarios, usuarios_grupos:usuarios_grupos!usuarios_id_grupo_usuarios_fkey ( id, grupo_usuarios )",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!u) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    type G = { id: number; grupo_usuarios: string | null };
    const gRaw = u.usuarios_grupos as G | G[] | null | undefined;
    const g = Array.isArray(gRaw) ? gRaw[0] : gRaw;
    const personalizado = await menusPersonalizadosDoUsuario(supabase, id);
    const idGrupo = typeof u.id_grupo_usuarios === "number" ? u.id_grupo_usuarios : Number(u.id_grupo_usuarios);
    const menusGrupo = Number.isFinite(idGrupo) && idGrupo > 0 ? await menusDoGrupo(supabase, idGrupo) : [];
    const efetivo = personalizado ?? menusGrupo;
    return NextResponse.json({
      alvo: "usuario",
      id,
      nome: (u.nome_completo as string | null)?.trim() || String(u.usuario),
      grupoNome: g?.grupo_usuarios ?? null,
      idGrupo: Number.isFinite(idGrupo) ? idGrupo : null,
      menus: efetivo,
      menusGrupo,
      origem: personalizado ? "usuario" : "grupo",
    });
  }

  return NextResponse.json({ error: "Informe alvo=grupo ou alvo=usuario." }, { status: 400 });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const sessionUserId = Number(session.sub);
  const supabase = createAdminClient();
  if (!(await podeGerenciarMenus(supabase, sessionUserId))) {
    return NextResponse.json({ error: "Sem permissão para gerenciar menus." }, { status: 403 });
  }

  let body: {
    alvo?: string;
    id?: number;
    menus?: unknown;
    limpar_personalizacao?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Informe o id." }, { status: 400 });
  }

  if (body.alvo === "usuario" && body.limpar_personalizacao) {
    await limparPersonalizacaoUsuario(supabase, id);
    const efetivo = await menusEfetivosDoUsuario(supabase, id);
    return NextResponse.json({ ok: true, menus: efetivo.menus, origem: efetivo.origem });
  }

  const menusRaw = Array.isArray(body.menus) ? body.menus : [];
  const menus = menusRaw.filter((c): c is string => typeof c === "string" && isChaveMenuLateral(c));

  if (body.alvo === "grupo") {
    const gravados = await substituirMenusGrupo(supabase, id, menus);
    return NextResponse.json({ ok: true, menus: gravados, origem: "grupo" });
  }

  if (body.alvo === "usuario") {
    const gravados = await substituirMenusUsuario(supabase, id, menus);
    return NextResponse.json({ ok: true, menus: gravados, origem: "usuario" });
  }

  return NextResponse.json({ error: "Informe alvo=grupo ou alvo=usuario." }, { status: 400 });
}
