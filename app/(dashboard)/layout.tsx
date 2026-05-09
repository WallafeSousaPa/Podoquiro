import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getNomesSaudacao } from "@/lib/dashboard/saudacao";
import { DashboardShell } from "./dashboard-shell";
import "./dashboard.css";

export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const {
    nomeCompleto,
    nomeEmpresaComId,
    somenteMenuInicio,
    menuRecepcao,
    menuAtendimento,
  } =
    await getNomesSaudacao(session.sub, session.usuario, session.idEmpresa);

  return (
    <DashboardShell
      nomeUsuario={nomeCompleto}
      nomeEmpresa={nomeEmpresaComId}
      somenteMenuInicio={somenteMenuInicio}
      menuRecepcao={menuRecepcao}
      menuAtendimento={menuAtendimento}
    >
      {children}
    </DashboardShell>
  );
}
