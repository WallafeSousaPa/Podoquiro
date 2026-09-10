import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { TabelasPrecoClient, type TabelaPrecoRow } from "./tabelas-preco-client";

export default async function TabelasPrecoPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const supabase = createAdminClient();
  let tabelas: TabelaPrecoRow[] = [];
  let loadError: string | null = null;

  try {
    const res = await supabase
      .from("tabelas_preco")
      .select("id, nome, descricao, ativo")
      .order("nome", { ascending: true });

    if (res.error) throw new Error(res.error.message);
    tabelas = (res.data ?? []) as TabelaPrecoRow[];
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Não foi possível carregar as tabelas de preço.";
  }

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Tabelas de preço</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Estoque</li>
                <li className="breadcrumb-item active">Tabelas de preço</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <TabelasPrecoClient tabelas={tabelas} loadError={loadError} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
