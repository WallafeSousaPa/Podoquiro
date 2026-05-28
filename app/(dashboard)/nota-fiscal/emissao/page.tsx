import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { NotaFiscalEmissaoClient } from "./nota-fiscal-emissao-client";

export default async function NotaFiscalEmissaoPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Emissão</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Nota Fiscal</li>
                <li className="breadcrumb-item active">Emissão</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <NotaFiscalEmissaoClient />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
