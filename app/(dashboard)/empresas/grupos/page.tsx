import { listEmpresaGrupos } from "@/lib/data/empresa-grupos";
import { EmpresaGruposClient } from "./empresa-grupos-client";

export default async function EmpresasGruposPage() {
  let rows: Awaited<ReturnType<typeof listEmpresaGrupos>> = [];
  let loadError: string | null = null;

  try {
    rows = await listEmpresaGrupos();
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Não foi possível carregar os grupos.";
  }

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Grupo de empresas</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Empresas</li>
                <li className="breadcrumb-item active">Grupo de empresas</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <EmpresaGruposClient initialRows={rows} loadError={loadError} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
