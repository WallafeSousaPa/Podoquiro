"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(src)), {
        once: true,
      });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.body.appendChild(s);
  });
}

const BODY_CLASSES = [
  "hold-transition",
  "sidebar-mini",
  "layout-fixed",
  "layout-navbar-fixed",
  "layout-footer-fixed",
] as const;

function cx(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

export function DashboardShell({
  nomeUsuario,
  nomeEmpresa,
  children,
}: {
  nomeUsuario: string;
  nomeEmpresa: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const loadingScripts = useRef(false);

  const [openUsuarios, setOpenUsuarios] = useState(() =>
    pathname.startsWith("/usuarios"),
  );
  const [openEmpresas, setOpenEmpresas] = useState(() =>
    pathname.startsWith("/empresas"),
  );
  const [openPacientes, setOpenPacientes] = useState(() =>
    pathname.startsWith("/pacientes"),
  );
  const [openProcedimentos, setOpenProcedimentos] = useState(() =>
    pathname.startsWith("/procedimentos"),
  );
  const [openFinanceiro, setOpenFinanceiro] = useState(() =>
    pathname.startsWith("/financeiro"),
  );
  const [openParametrizacao, setOpenParametrizacao] = useState(() =>
    pathname.startsWith("/financeiro/parametrizacao"),
  );

  useEffect(() => {
    setOpenUsuarios(pathname.startsWith("/usuarios"));
    setOpenEmpresas(pathname.startsWith("/empresas"));
    setOpenPacientes(pathname.startsWith("/pacientes"));
    setOpenProcedimentos(pathname.startsWith("/procedimentos"));
    setOpenFinanceiro(pathname.startsWith("/financeiro"));
    setOpenParametrizacao(pathname.startsWith("/financeiro/parametrizacao"));
  }, [pathname]);

  useEffect(() => {
    BODY_CLASSES.forEach((c) => document.body.classList.add(c));
    return () => {
      BODY_CLASSES.forEach((c) => document.body.classList.remove(c));
    };
  }, []);

  useEffect(() => {
    if (loadingScripts.current) return;
    loadingScripts.current = true;
    void (async () => {
      try {
        await loadScript("https://code.jquery.com/jquery-3.6.0.min.js");
        await loadScript(
          "https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js",
        );
        await loadScript(
          "https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/js/adminlte.min.js",
        );
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }, [router]);

  const isInicio = pathname === "/inicio";
  const isUsuarios = pathname.startsWith("/usuarios");
  const isEmpresas = pathname.startsWith("/empresas");
  const isPacientes = pathname.startsWith("/pacientes");
  const isProcedimentos = pathname.startsWith("/procedimentos");
  const isFinanceiro = pathname.startsWith("/financeiro");
  const isParametrizacao = pathname.startsWith("/financeiro/parametrizacao");

  return (
    <div className="wrapper">
      <nav className="main-header navbar navbar-expand navbar-white navbar-light border-bottom-0">
        <ul className="navbar-nav">
          <li className="nav-item">
            <a
              className="nav-link"
              data-widget="pushmenu"
              href="#"
              role="button"
              title="Alternar menu"
              aria-label="Alternar menu lateral"
            >
              <i className="fas fa-bars" />
            </a>
          </li>
        </ul>
        <ul className="navbar-nav ml-auto">
          <li className="nav-item dropdown">
            <a
              className="nav-link dropdown-toggle"
              href="#"
              data-toggle="dropdown"
              role="button"
              aria-haspopup="true"
              aria-expanded="false"
            >
              <i className="far fa-user mr-1" />
              {nomeUsuario}
            </a>
            <div className="dropdown-menu dropdown-menu-right">
              <span className="dropdown-item-text text-muted small">
                {nomeEmpresa}
              </span>
              <div className="dropdown-divider" />
              <Link href="/conta/senha" className="dropdown-item">
                <i className="fas fa-key mr-2 text-muted" aria-hidden />
                Alterar senha
              </Link>
              <div className="dropdown-divider" />
              <button
                type="button"
                className="dropdown-item text-danger"
                onClick={() => void logout()}
              >
                Sair
              </button>
            </div>
          </li>
        </ul>
      </nav>

      <aside className="main-sidebar sidebar-dark-primary elevation-4">
        <Link href="/inicio" className="brand-link">
          <span className="brand-text font-weight-light">Podoquiro</span>
        </Link>
        <div className="sidebar">
          <nav className="mt-2">
            <ul
              className="nav nav-pills nav-sidebar flex-column"
              role="navigation"
            >
              <li className="nav-item">
                <Link
                  href="/inicio"
                  className={cx("nav-link", isInicio && "active")}
                >
                  <i className="nav-icon fas fa-home" />
                  <p>Início</p>
                </Link>
              </li>

              <li
                className={cx(
                  "nav-item",
                  "has-treeview",
                  openUsuarios && "menu-open",
                )}
              >
                <a
                  href="#"
                  className={cx("nav-link", isUsuarios && "active")}
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenUsuarios((v) => !v);
                  }}
                >
                  <i className="nav-icon fas fa-users" />
                  <p>
                    Usuários
                    <i className="right fas fa-angle-left" />
                  </p>
                </a>
                <ul className="nav nav-treeview">
                  <li className="nav-item">
                    <Link
                      href="/usuarios/cadastro"
                      className={cx(
                        "nav-link",
                        pathname === "/usuarios/cadastro" && "active",
                      )}
                    >
                      <i className="far fa-circle nav-icon" />
                      <p>Cadastro</p>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link
                      href="/usuarios/grupos"
                      className={cx(
                        "nav-link",
                        pathname === "/usuarios/grupos" && "active",
                      )}
                    >
                      <i className="far fa-circle nav-icon" />
                      <p>Grupo de usuários</p>
                    </Link>
                  </li>
                </ul>
              </li>

              <li
                className={cx(
                  "nav-item",
                  "has-treeview",
                  openPacientes && "menu-open",
                )}
              >
                <a
                  href="#"
                  className={cx("nav-link", isPacientes && "active")}
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenPacientes((v) => !v);
                  }}
                >
                  <i className="nav-icon fas fa-user-injured" />
                  <p>
                    Pacientes
                    <i className="right fas fa-angle-left" />
                  </p>
                </a>
                <ul className="nav nav-treeview">
                  <li className="nav-item">
                    <Link
                      href="/pacientes/cadastro"
                      className={cx(
                        "nav-link",
                        pathname === "/pacientes/cadastro" && "active",
                      )}
                    >
                      <i className="far fa-circle nav-icon" />
                      <p>Cadastrar</p>
                    </Link>
                  </li>
                </ul>
              </li>

              <li
                className={cx(
                  "nav-item",
                  "has-treeview",
                  openProcedimentos && "menu-open",
                )}
              >
                <a
                  href="#"
                  className={cx("nav-link", isProcedimentos && "active")}
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenProcedimentos((v) => !v);
                  }}
                >
                  <i className="nav-icon fas fa-notes-medical" />
                  <p>
                    Procedimentos
                    <i className="right fas fa-angle-left" />
                  </p>
                </a>
                <ul className="nav nav-treeview">
                  <li className="nav-item">
                    <Link
                      href="/procedimentos/cadastro"
                      className={cx(
                        "nav-link",
                        pathname === "/procedimentos/cadastro" && "active",
                      )}
                    >
                      <i className="far fa-circle nav-icon" />
                      <p>Cadastrar</p>
                    </Link>
                  </li>
                </ul>
              </li>

              <li
                className={cx(
                  "nav-item",
                  "has-treeview",
                  openFinanceiro && "menu-open",
                )}
              >
                <a
                  href="#"
                  className={cx("nav-link", isFinanceiro && "active")}
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenFinanceiro((v) => !v);
                  }}
                >
                  <i className="nav-icon fas fa-coins" />
                  <p>
                    Financeiro
                    <i className="right fas fa-angle-left" />
                  </p>
                </a>
                <ul className="nav nav-treeview">
                  <li
                    className={cx(
                      "nav-item",
                      "has-treeview",
                      openParametrizacao && "menu-open",
                    )}
                  >
                    <a
                      href="#"
                      className={cx("nav-link", isParametrizacao && "active")}
                      onClick={(e) => {
                        e.preventDefault();
                        setOpenParametrizacao((v) => !v);
                      }}
                    >
                      <i className="far fa-circle nav-icon" />
                      <p>
                        Parametrização
                        <i className="right fas fa-angle-left" />
                      </p>
                    </a>
                    <ul className="nav nav-treeview">
                      <li className="nav-item">
                        <Link
                          href="/financeiro/parametrizacao/maquinetas"
                          className={cx(
                            "nav-link",
                            pathname === "/financeiro/parametrizacao/maquinetas" &&
                              "active",
                          )}
                        >
                          <i className="far fa-dot-circle nav-icon" />
                          <p>Maquinetas</p>
                        </Link>
                      </li>
                      <li className="nav-item">
                        <Link
                          href="/financeiro/parametrizacao/tipos-pagamento"
                          className={cx(
                            "nav-link",
                            pathname === "/financeiro/parametrizacao/tipos-pagamento" &&
                              "active",
                          )}
                        >
                          <i className="far fa-dot-circle nav-icon" />
                          <p>Tipos de pagamento</p>
                        </Link>
                      </li>
                    </ul>
                  </li>
                </ul>
              </li>

              <li
                className={cx(
                  "nav-item",
                  "has-treeview",
                  openEmpresas && "menu-open",
                )}
              >
                <a
                  href="#"
                  className={cx("nav-link", isEmpresas && "active")}
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenEmpresas((v) => !v);
                  }}
                >
                  <i className="nav-icon fas fa-building" />
                  <p>
                    Empresas
                    <i className="right fas fa-angle-left" />
                  </p>
                </a>
                <ul className="nav nav-treeview">
                  <li className="nav-item">
                    <Link
                      href="/empresas/cadastro"
                      className={cx(
                        "nav-link",
                        pathname === "/empresas/cadastro" && "active",
                      )}
                    >
                      <i className="far fa-circle nav-icon" />
                      <p>Cadastrar empresa</p>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link
                      href="/empresas/salas"
                      className={cx(
                        "nav-link",
                        pathname === "/empresas/salas" && "active",
                      )}
                    >
                      <i className="far fa-circle nav-icon" />
                      <p>Salas</p>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link
                      href="/empresas/grupos"
                      className={cx(
                        "nav-link",
                        pathname === "/empresas/grupos" && "active",
                      )}
                    >
                      <i className="far fa-circle nav-icon" />
                      <p>Grupo de empresas</p>
                    </Link>
                  </li>
                </ul>
              </li>
            </ul>
          </nav>
        </div>
      </aside>

      <div className="content-wrapper">{children}</div>

      <footer className="main-footer">
        <strong>Podoquiro</strong>
        <div className="float-right d-none d-sm-inline-block">
          <small className="text-muted">Podoquiro 1.0</small>
        </div>
      </footer>
    </div>
  );
}
