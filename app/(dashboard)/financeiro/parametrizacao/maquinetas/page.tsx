import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { MaquinetasClient } from "./maquinetas-client";

type MaquinetaRow = {
  id: number;
  nome: string;
  ativo: boolean;
};

export default async function MaquinetasPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const supabase = createAdminClient();
  let maquinetas: MaquinetaRow[] = [];
  let loadError: string | null = null;

  try {
    const res = await supabase
      .from("maquinetas")
      .select("id, nome, ativo")
      .order("nome", { ascending: true });

    if (res.error) throw new Error(res.error.message);
    maquinetas = (res.data ?? []) as MaquinetaRow[];
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
              <h1 className="m-0 text-dark">Maquinetas</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Financeiro</li>
                <li className="breadcrumb-item">Parametrização</li>
                <li className="breadcrumb-item active">Maquinetas</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <MaquinetasClient maquinetas={maquinetas} loadError={loadError} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
