import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SalasClient } from "./salas-client";

type EmpresaOpt = {
  id: number;
  nome_fantasia: string;
};

type SalaRaw = {
  id: number;
  id_empresa: number;
  nome_sala: string;
  ativo: boolean;
  ultima_atualizacao: string;
  nome_fantasia: string | null;
};

function mapSalaRow(row: {
  id: number;
  id_empresa: number;
  nome_sala: string;
  ativo: boolean;
  ultima_atualizacao: string;
  empresas: { nome_fantasia: string } | { nome_fantasia: string }[] | null;
}): SalaRaw {
  const emp = row.empresas;
  const nomeFantasia = Array.isArray(emp)
    ? (emp[0]?.nome_fantasia ?? null)
    : (emp?.nome_fantasia ?? null);
  return {
    id: row.id,
    id_empresa: row.id_empresa,
    nome_sala: row.nome_sala,
    ativo: row.ativo,
    ultima_atualizacao: row.ultima_atualizacao,
    nome_fantasia: nomeFantasia,
  };
}

export default async function EmpresasSalasPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const supabase = createAdminClient();
  let empresas: EmpresaOpt[] = [];
  let salas: SalaRaw[] = [];
  let loadError: string | null = null;

  try {
    const [empRes, salasRes] = await Promise.all([
      supabase
        .from("empresas")
        .select("id, nome_fantasia")
        .order("nome_fantasia", { ascending: true }),
      supabase
        .from("salas")
        .select(
          "id, id_empresa, nome_sala, ativo, ultima_atualizacao, empresas(nome_fantasia)",
        )
        .order("id_empresa", { ascending: true })
        .order("nome_sala", { ascending: true }),
    ]);

    if (empRes.error) throw new Error(empRes.error.message);
    if (salasRes.error) throw new Error(salasRes.error.message);

    empresas = (empRes.data ?? []) as EmpresaOpt[];
    salas = (salasRes.data ?? []).map((row) =>
      mapSalaRow(
        row as {
          id: number;
          id_empresa: number;
          nome_sala: string;
          ativo: boolean;
          ultima_atualizacao: string;
          empresas: { nome_fantasia: string } | { nome_fantasia: string }[] | null;
        },
      ),
    );
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Não foi possível carregar os dados.";
  }

  const defaultIdEmpresa = session.idEmpresa?.trim() ?? "";

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Salas</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Empresas</li>
                <li className="breadcrumb-item active">Salas</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <SalasClient
                empresas={empresas}
                salas={salas}
                defaultIdEmpresa={defaultIdEmpresa}
                loadError={loadError}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
