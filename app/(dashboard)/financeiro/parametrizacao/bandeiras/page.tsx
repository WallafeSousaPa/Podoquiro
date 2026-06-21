import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { BandeirasClient } from "./bandeiras-client";

type BandeiraRow = {
  id: number;
  codigo: string;
  nome_bandeira: string;
  ativo: boolean;
};

export default async function BandeirasPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const supabase = createAdminClient();
  let bandeiras: BandeiraRow[] = [];
  let loadError: string | null = null;

  try {
    const res = await supabase
      .from("bandeiras")
      .select("id, codigo, nome_bandeira, ativo")
      .order("codigo", { ascending: true });

    if (res.error) throw new Error(res.error.message);
    bandeiras = (res.data ?? []) as BandeiraRow[];
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
              <h1 className="m-0 text-dark">Bandeiras</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Financeiro</li>
                <li className="breadcrumb-item">Parametrização</li>
                <li className="breadcrumb-item active">Bandeiras</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <BandeirasClient bandeiras={bandeiras} loadError={loadError} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
