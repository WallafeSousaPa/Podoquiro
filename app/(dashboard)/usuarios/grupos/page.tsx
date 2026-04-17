import { listUsuariosGrupos } from "@/lib/data/usuarios-grupos";
import { UsuariosGruposClient } from "./usuarios-grupos-client";

export default async function UsuariosGruposPage() {
  let rows: Awaited<ReturnType<typeof listUsuariosGrupos>> = [];
  let loadError: string | null = null;

  try {
    rows = await listUsuariosGrupos();
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
              <h1 className="m-0 text-dark">Grupo de usuários</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Usuários</li>
                <li className="breadcrumb-item active">Grupo de usuários</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <UsuariosGruposClient initialRows={rows} loadError={loadError} />
        </div>
      </section>
    </>
  );
}
