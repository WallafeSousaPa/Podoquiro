import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { CaixaPaginaClient } from "./caixa-pagina-client";

export default async function FinanceiroCaixaPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const empresaId = Number(session.idEmpresa);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    redirect("/inicio");
  }

  const sessionUserId = Number(session.sub);
  if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
    redirect("/inicio");
  }

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Caixa</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Financeiro</li>
                <li className="breadcrumb-item active">Caixa</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <CaixaPaginaClient />
        </div>
      </section>
    </>
  );
}
