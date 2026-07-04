import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getNomesSaudacao } from "@/lib/dashboard/saudacao";
import { ComparativoClient } from "./comparativo-client";

export default async function RelatorioComparativoPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { podeVerRelatorioCaixa } = await getNomesSaudacao(
    session.sub,
    session.usuario,
    session.idEmpresa,
  );
  if (!podeVerRelatorioCaixa) redirect("/inicio");

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Comparativo</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Relatórios</li>
                <li className="breadcrumb-item active">Comparativo</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <ComparativoClient />
        </div>
      </section>
    </>
  );
}
