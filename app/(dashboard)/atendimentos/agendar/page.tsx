import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getNomesSaudacao } from "@/lib/dashboard/saudacao";
import { AgendarAtendimentoClient } from "./agendar-atendimento-client";

export default async function AgendarAtendimentoPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { nomeCompleto, nomeEmpresaComId, somenteMenuInicio } = await getNomesSaudacao(
    session.sub,
    session.usuario,
    session.idEmpresa,
  );

  if (somenteMenuInicio) redirect("/inicio");

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Agendar atendimento</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Atendimentos</li>
                <li className="breadcrumb-item active">Agendar</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <p className="text-muted small mb-3">
            Olá, <strong>{nomeCompleto}</strong> — <strong>{nomeEmpresaComId}</strong>.
          </p>
          <AgendarAtendimentoClient />
        </div>
      </section>
    </>
  );
}
