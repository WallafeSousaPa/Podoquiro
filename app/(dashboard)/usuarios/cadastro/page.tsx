import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { UsuariosCadastroClient } from "./usuarios-cadastro-client";

type GrupoItem = {
  id: number;
  grupo_usuarios: string;
};

type EmpresaOption = {
  id: number;
  nome_fantasia: string;
};

type UsuarioRaw = {
  id: number;
  usuario: string;
  nome_completo: string | null;
  cpf: string | null;
  email: string | null;
  ativo: boolean;
  id_grupo_usuarios: number;
  id_empresa: number;
  exibir_na_agenda: boolean;
  usuarios_grupos:
    | { id: number; grupo_usuarios: string }
    | { id: number; grupo_usuarios: string }[]
    | null;
};

export default async function UsuariosCadastroPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const empresaId = Number(session.idEmpresa);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    redirect("/inicio");
  }

  const supabase = createAdminClient();
  let grupos: GrupoItem[] = [];
  let empresas: EmpresaOption[] = [];
  let usuarios: UsuarioRaw[] = [];
  let loadError: string | null = null;

  try {
    const [
      { data: gruposData, error: gruposError },
      { data: empresasData, error: empresasError },
      { data: usuariosData, error: usuariosError },
    ] = await Promise.all([
      supabase
        .from("usuarios_grupos")
        .select("id, grupo_usuarios")
        .eq("ativo", true)
        .order("grupo_usuarios", { ascending: true }),
      supabase
        .from("empresas")
        .select("id, nome_fantasia")
        .eq("ativo", true)
        .order("nome_fantasia", { ascending: true }),
      supabase
        .from("usuarios")
        .select(
          "id, usuario, nome_completo, cpf, email, ativo, id_grupo_usuarios, id_empresa, exibir_na_agenda, usuarios_grupos:usuarios_grupos!usuarios_id_grupo_usuarios_fkey(id, grupo_usuarios)",
        )
        .eq("id_empresa", empresaId)
        .order("usuario", { ascending: true }),
    ]);

    if (gruposError) throw new Error(gruposError.message);
    if (empresasError) throw new Error(empresasError.message);
    if (usuariosError) throw new Error(usuariosError.message);

    grupos = (gruposData ?? []) as GrupoItem[];
    empresas = (empresasData ?? []) as EmpresaOption[];
    usuarios = (usuariosData ?? []) as UsuarioRaw[];
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Não foi possível carregar os usuários.";
  }

  const nomeEmpresaPorId = new Map(empresas.map((e) => [e.id, e.nome_fantasia]));

  const usuariosView = usuarios.map((u) => ({
    id: u.id,
    usuario: u.usuario,
    nome_completo: u.nome_completo,
    cpf: u.cpf,
    email: u.email,
    ativo: u.ativo,
    id_grupo_usuarios: u.id_grupo_usuarios,
    id_empresa: u.id_empresa,
    exibir_na_agenda: Boolean(u.exibir_na_agenda),
    nome_empresa: nomeEmpresaPorId.get(u.id_empresa) ?? null,
    grupo_usuarios: Array.isArray(u.usuarios_grupos)
      ? (u.usuarios_grupos[0]?.grupo_usuarios ?? null)
      : (u.usuarios_grupos?.grupo_usuarios ?? null),
  }));

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Cadastro de usuários</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Usuários</li>
                <li className="breadcrumb-item active">Cadastro</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <UsuariosCadastroClient
                grupos={grupos}
                empresas={empresas}
                idEmpresaSessao={empresaId}
                usuarios={usuariosView}
                loadError={loadError}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
