import { createAdminClient } from "@/lib/supabase/admin";
import { EmpresasCadastroClient } from "./empresas-cadastro-client";

type GrupoItem = {
  id: number;
  grupo_empresa: string;
};

type EmpresaRaw = {
  id: number;
  nome_fantasia: string;
  razao_social: string;
  cnpj_cpf: string;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  id_empresa_grupo: number;
  ativo: boolean;
  empresa_grupos:
    | { id: number; grupo_empresa: string }
    | { id: number; grupo_empresa: string }[]
    | null;
};

export default async function EmpresasCadastroPage() {
  const supabase = createAdminClient();
  let grupos: GrupoItem[] = [];
  let empresas: EmpresaRaw[] = [];
  let loadError: string | null = null;

  try {
    const [{ data: gruposData, error: gruposError }, { data: empresasData, error: empresasError }] =
      await Promise.all([
        supabase
          .from("empresa_grupos")
          .select("id, grupo_empresa")
          .eq("ativo", true)
          .order("grupo_empresa", { ascending: true }),
        supabase
          .from("empresas")
          .select(
            "id, nome_fantasia, razao_social, cnpj_cpf, cep, endereco, numero, complemento, bairro, cidade, estado, id_empresa_grupo, ativo, empresa_grupos:empresa_grupos!empresas_id_empresa_grupo_fkey(id, grupo_empresa)",
          )
          .order("nome_fantasia", { ascending: true }),
      ]);

    if (gruposError) throw new Error(gruposError.message);
    if (empresasError) throw new Error(empresasError.message);

    grupos = (gruposData ?? []) as GrupoItem[];
    empresas = (empresasData ?? []) as EmpresaRaw[];
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Não foi possível carregar as empresas.";
  }

  const empresasView = empresas.map((e) => ({
    id: e.id,
    nome_fantasia: e.nome_fantasia,
    razao_social: e.razao_social,
    cnpj_cpf: e.cnpj_cpf,
    cep: e.cep,
    endereco: e.endereco,
    numero: e.numero,
    complemento: e.complemento,
    bairro: e.bairro,
    cidade: e.cidade,
    estado: e.estado,
    id_empresa_grupo: e.id_empresa_grupo,
    ativo: e.ativo,
    grupo_empresa: Array.isArray(e.empresa_grupos)
      ? (e.empresa_grupos[0]?.grupo_empresa ?? null)
      : (e.empresa_grupos?.grupo_empresa ?? null),
  }));

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Cadastrar empresa</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Empresas</li>
                <li className="breadcrumb-item active">Cadastrar empresa</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <EmpresasCadastroClient
                grupos={grupos}
                empresas={empresasView}
                loadError={loadError}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
