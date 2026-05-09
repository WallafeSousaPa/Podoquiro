import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getNomesSaudacao } from "@/lib/dashboard/saudacao";
import { AtendimentoFila } from "./atendimento-fila";

export default async function AtendimentoPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { nomeCompleto, nomeEmpresaComId, menuAtendimento } = await getNomesSaudacao(
    session.sub,
    session.usuario,
    session.idEmpresa,
  );
  if (!menuAtendimento) {
    redirect("/inicio");
  }

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Atendimento</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Atendimentos</li>
                <li className="breadcrumb-item active">Atendimento</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <p className="text-muted small mb-3">
                Olá, <strong>{nomeCompleto}</strong> — <strong>{nomeEmpresaComId}</strong>.
              </p>
              <AtendimentoFila />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
