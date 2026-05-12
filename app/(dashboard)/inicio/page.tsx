import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getNomesSaudacao } from "@/lib/dashboard/saudacao";
import { AgendaCalendario } from "./agenda-calendario";

export default async function InicioPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { nomeEmpresaCurto, somenteMenuInicio, podeAgendarRetroativo } =
    await getNomesSaudacao(session.sub, session.usuario, session.idEmpresa);

  return (
    <section className="content pt-2">
      <div className="container-fluid">
        <div className="row">
          <div className="col-12">
            <AgendaCalendario
              idEmpresa={session.idEmpresa}
              nomeEmpresa={nomeEmpresaCurto}
              somenteMenuInicio={somenteMenuInicio}
              podeAgendarRetroativo={podeAgendarRetroativo}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
