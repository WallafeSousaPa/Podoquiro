import Link from "next/link";
import { AlterarSenhaForm } from "./alterar-senha-form";

export default function ContaSenhaPage() {
  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Alterar senha</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <Link href="/inicio">Início</Link>
                </li>
                <li className="breadcrumb-item active">Alterar senha</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row justify-content-center">
            <div className="col-md-8 col-lg-6">
              <AlterarSenhaForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
