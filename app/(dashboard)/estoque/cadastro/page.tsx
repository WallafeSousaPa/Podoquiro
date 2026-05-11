import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ProdutosCadastroClient,
  type EmpresaListaItem,
  type ProdutoRow,
} from "./produtos-cadastro-client";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function EstoqueCadastroPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    redirect("/login");
  }

  const supabase = createAdminClient();
  let produtos: ProdutoRow[] = [];
  let empresas: EmpresaListaItem[] = [];
  let loadError: string | null = null;

  try {
    const [resProd, resEmp] = await Promise.all([
      supabase
        .from("produtos")
        .select("*")
        .eq("id_empresa", empresaId)
        .order("produto", { ascending: true }),
      supabase
        .from("empresas")
        .select("id, nome_fantasia")
        .order("nome_fantasia", { ascending: true }),
    ]);

    if (resProd.error) throw new Error(resProd.error.message);
    if (resEmp.error) throw new Error(resEmp.error.message);
    produtos = (resProd.data ?? []) as ProdutoRow[];
    empresas = (resEmp.data ?? []) as EmpresaListaItem[];
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Não foi possível carregar os dados.";
  }

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Cadastro de produtos</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Estoque</li>
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
              <ProdutosCadastroClient
                produtos={produtos}
                empresas={empresas}
                empresaIdPadrao={empresaId}
                loadError={loadError}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
