import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const userId = Number(session.sub);
  const empresaId = Number(session.idEmpresa);
  let nomeUsuario = session.usuario;
  let nomeEmpresa = "";

  if (Number.isFinite(userId) && userId > 0 && Number.isFinite(empresaId) && empresaId > 0) {
    const supabase = createAdminClient();
    const [{ data: uRow }, { data: eRow }] = await Promise.all([
      supabase.from("usuarios").select("nome_completo").eq("id", userId).maybeSingle(),
      supabase.from("empresas").select("nome_fantasia").eq("id", empresaId).maybeSingle(),
    ]);
    const nc = uRow?.nome_completo?.trim();
    if (nc) nomeUsuario = nc;
    const nf = eRow?.nome_fantasia?.trim();
    if (nf) nomeEmpresa = nf;
  }

  if (!nomeEmpresa) {
    nomeEmpresa = `Empresa #${session.idEmpresa}`;
  }

  return (
    <DashboardShell nomeUsuario={nomeUsuario} nomeEmpresa={nomeEmpresa}>
      {children}
    </DashboardShell>
  );
}
