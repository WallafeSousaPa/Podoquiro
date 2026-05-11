import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { NfeNotasClient, type NfeEmissaoRow } from "./nfe-notas-client";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function NfeNotasPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    redirect("/login");
  }

  const supabase = createAdminClient();
  let rows: NfeEmissaoRow[] = [];
  let loadError: string | null = null;

  try {
    const res = await supabase
      .from("nfe_emissoes")
      .select(
        "id, ambiente, serie, numero_nf, status, chave_acesso, protocolo_autorizacao, c_stat, x_motivo, created_at, updated_at",
      )
      .eq("id_empresa", empresaId)
      .order("updated_at", { ascending: false });

    if (res.error) throw new Error(res.error.message);
    rows = (res.data ?? []) as NfeEmissaoRow[];
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Não foi possível carregar as notas fiscais.";
  }

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Notas fiscais</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Financeiro</li>
                <li className="breadcrumb-item">Nota Fiscal</li>
                <li className="breadcrumb-item active">Notas</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <NfeNotasClient rows={rows} loadError={loadError} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
