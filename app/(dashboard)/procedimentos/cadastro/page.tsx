import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProcedimentosCadastroClient } from "./procedimentos-cadastro-client";

type ProcedimentoRaw = {
  id: number;
  procedimento: string;
  custo_base: string | number;
  margem_lucro: string | number;
  taxas_impostos: string | number;
  valor_total: string | number;
  ativo: boolean;
  ultima_atualizacao: string;
};

export default async function ProcedimentosCadastroPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const empresaId = Number(session.idEmpresa);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    redirect("/inicio");
  }

  const supabase = createAdminClient();
  let procedimentos: ProcedimentoRaw[] = [];
  let loadError: string | null = null;

  try {
    const { data, error } = await supabase
      .from("procedimentos")
      .select(
        "id, procedimento, custo_base, margem_lucro, taxas_impostos, valor_total, ativo, ultima_atualizacao",
      )
      .eq("id_empresa", empresaId)
      .order("procedimento", { ascending: true });

    if (error) throw new Error(error.message);
    procedimentos = (data ?? []) as ProcedimentoRaw[];
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Não foi possível carregar os procedimentos.";
  }

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Cadastrar procedimentos</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Procedimentos</li>
                <li className="breadcrumb-item active">Cadastrar</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <ProcedimentosCadastroClient
                procedimentos={procedimentos}
                loadError={loadError}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
