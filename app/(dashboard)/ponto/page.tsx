import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getNomesSaudacao } from "@/lib/dashboard/saudacao";
import { PontoClient } from "./ponto-client";
import "./ponto.css";

export default async function PontoPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { podeVerMenuPonto } = await getNomesSaudacao(
    session.sub,
    session.usuario,
    session.idEmpresa,
  );
  if (!podeVerMenuPonto) {
    redirect("/inicio");
  }

  return (
    <>
      <div className="content-header ponto-page-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-12 col-md-6">
              <h1 className="m-0 text-dark">Consulta de ponto</h1>
            </div>
            <div className="col-12 col-md-6">
              <ol className="breadcrumb float-md-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item active">Ponto</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <PontoClient />
        </div>
      </section>
    </>
  );
}
