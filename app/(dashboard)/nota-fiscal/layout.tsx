import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getNomesSaudacao } from "@/lib/dashboard/saudacao";

export default async function NotaFiscalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { podeVerMenuNotaFiscal } = await getNomesSaudacao(
    session.sub,
    session.usuario,
    session.idEmpresa,
  );

  if (!podeVerMenuNotaFiscal) {
    redirect("/inicio");
  }

  return children;
}
