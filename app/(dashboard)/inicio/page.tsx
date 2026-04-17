import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function InicioPage() {
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
              <h1 className="m-0 text-dark">Início</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item active">Painel</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-lg-3 col-6">
              <div className="small-box bg-info">
                <div className="inner">
                  <h3>Olá</h3>
                  <p>{session.usuario}</p>
                </div>
                <div className="icon">
                  <i className="fas fa-user" />
                </div>
                <span className="small-box-footer d-block text-left px-3 py-2">
                  Usuário logado
                </span>
              </div>
            </div>
            <div className="col-lg-3 col-6">
              <div className="small-box bg-success">
                <div className="inner">
                  <h3>Empresa</h3>
                  <p>ID {session.idEmpresa}</p>
                </div>
                <div className="icon">
                  <i className="fas fa-building" />
                </div>
                <span className="small-box-footer d-block text-left px-3 py-2">
                  Vínculo atual
                </span>
              </div>
            </div>
            <div className="col-lg-3 col-6">
              <div className="small-box bg-warning">
                <div className="inner">
                  <h3>Podoquiro</h3>
                  <p>Agenda &amp; gestão</p>
                </div>
                <div className="icon">
                  <i className="fas fa-heartbeat" />
                </div>
                <a href="/inicio" className="small-box-footer">
                  Acessar início <i className="fas fa-arrow-circle-right" />
                </a>
              </div>
            </div>
            <div className="col-lg-3 col-6">
              <div className="small-box bg-danger">
                <div className="inner">
                  <h3>Suporte</h3>
                  <p>Administrador</p>
                </div>
                <div className="icon">
                  <i className="fas fa-headset" />
                </div>
                <span className="small-box-footer d-block text-left px-3 py-2">
                  Contate o administrador
                </span>
              </div>
            </div>
          </div>

          <div className="row">
            <div className="col-lg-8">
              <div className="card">
                <div className="card-header border-0">
                  <h3 className="card-title">Bem-vindo ao sistema</h3>
                </div>
                <div className="card-body">
                  <p className="card-text mb-0">
                    Esta área utiliza o layout do{" "}
                    <strong>AdminLTE 3.2</strong> (navbar superior, sidebar e
                    rodapé), conforme a documentação oficial.
                  </p>
                </div>
              </div>
            </div>
            <div className="col-lg-4">
              <div className="card card-outline card-primary">
                <div className="card-header">
                  <h3 className="card-title">Atalhos</h3>
                </div>
                <div className="card-body p-0">
                  <ul className="nav nav-pills flex-column">
                    <li className="nav-item">
                      <a href="/inicio" className="nav-link active">
                        <i className="fas fa-home mr-2" />
                        Início
                      </a>
                    </li>
                    <li className="nav-item">
                      <a href="/usuarios/cadastro" className="nav-link">
                        <i className="fas fa-user-plus mr-2" />
                        Cadastro de usuários
                      </a>
                    </li>
                    <li className="nav-item">
                      <a href="/empresas/cadastro" className="nav-link">
                        <i className="fas fa-building mr-2" />
                        Cadastrar empresa
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
