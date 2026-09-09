import { getSession } from "@/lib/auth/session";
import { getNomesSaudacao } from "@/lib/dashboard/saudacao";
import { usuarioTemMenu } from "@/lib/dashboard/menus-catalogo";
import { redirect } from "next/navigation";
import { MenusPermissoesClient } from "./menus-client";

export default async function UsuariosMenusPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { menusLiberados } = await getNomesSaudacao(
    session.sub,
    session.usuario,
    session.idEmpresa,
  );
  if (!usuarioTemMenu(menusLiberados, "usuarios.menus")) {
    redirect("/inicio");
  }

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Menus</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Usuários</li>
                <li className="breadcrumb-item active">Menus</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <p className="text-muted">
            Liberar itens do menu lateral por tipo de usuário ou por pessoa. O que for
            salvo aqui vale no próximo carregamento do sistema.
          </p>
          <MenusPermissoesClient />
        </div>
      </section>
    </>
  );
}
