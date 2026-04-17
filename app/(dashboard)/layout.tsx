import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
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

  return (
    <DashboardShell usuario={session.usuario} idEmpresa={session.idEmpresa}>
      {children}
    </DashboardShell>
  );
}
