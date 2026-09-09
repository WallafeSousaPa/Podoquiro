"use client";

import { DashboardSidebarNav } from "./dashboard-sidebar-nav";
import { chaveMenuPorPathname, usuarioTemMenu } from "@/lib/dashboard/menus-catalogo";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
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
  "sidebar-collapse",
  "layout-fixed",
  "layout-navbar-fixed",
  "layout-footer-fixed",
] as const;

const SIDEBAR_DESKTOP_MIN_WIDTH = 992;

function isDesktopSidebarLayout() {
  return window.matchMedia(`(min-width: ${SIDEBAR_DESKTOP_MIN_WIDTH}px)`).matches;
}

const ROTAS_SEMPRE_LIVRES = ["/inicio", "/conta/senha"] as const;

function rotaSempreLivre(pathname: string): boolean {
  return ROTAS_SEMPRE_LIVRES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export function DashboardShell({
  nomeUsuario,
  nomeEmpresa,
  menusLiberados = [],
  children,
}: {
  nomeUsuario: string;
  nomeEmpresa: string;
  menusLiberados?: string[];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const loadingScripts = useRef(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLAnchorElement>(null);

  const menusSet = new Set(menusLiberados);

  useEffect(() => {
    BODY_CLASSES.forEach((c) => document.body.classList.add(c));
    const soltarTransicao = window.setTimeout(() => {
      document.body.classList.remove("hold-transition");
    }, 200);
    return () => {
      window.clearTimeout(soltarTransicao);
      BODY_CLASSES.forEach((c) => document.body.classList.remove(c));
      document.body.classList.remove(
        "hold-transition",
        "sidebar-open",
        "sidebar-closed",
        "sidebar-is-opening",
      );
    };
  }, []);

  const fecharExpandidoPorClique = useCallback(() => {
    if (isDesktopSidebarLayout()) {
      sidebarRef.current?.classList.remove("sidebar-focused");
    }
  }, []);

  const fecharMenuMobile = useCallback(() => {
    document.body.classList.remove("sidebar-open", "sidebar-is-opening");
    document.body.classList.add("sidebar-collapse", "sidebar-closed");
  }, []);

  const alternarMenuLateral = useCallback(
    (e: ReactMouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDesktopSidebarLayout()) {
        const abrir = !document.body.classList.contains("sidebar-open");
        if (abrir) {
          document.body.classList.add("sidebar-open", "sidebar-is-opening");
          document.body.classList.remove("sidebar-collapse", "sidebar-closed");
        } else {
          fecharMenuMobile();
        }
        return;
      }
      document.body.classList.add("sidebar-collapse");
      sidebarRef.current?.classList.toggle("sidebar-focused");
    },
    [fecharMenuMobile],
  );

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const onDocumentClick = (ev: MouseEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (sidebar.contains(target) || hamburgerRef.current?.contains(target)) {
        return;
      }
      if (isDesktopSidebarLayout()) {
        sidebar.classList.remove("sidebar-focused");
        return;
      }
      if (document.body.classList.contains("sidebar-open")) {
        fecharMenuMobile();
      }
    };

    const onResize = () => {
      if (isDesktopSidebarLayout()) {
        document.body.classList.remove(
          "sidebar-open",
          "sidebar-closed",
          "sidebar-is-opening",
        );
        document.body.classList.add("sidebar-collapse");
      }
    };

    document.addEventListener("click", onDocumentClick);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      window.removeEventListener("resize", onResize);
    };
  }, [fecharMenuMobile]);

  useEffect(() => {
    if (rotaSempreLivre(pathname)) return;
    const chave = chaveMenuPorPathname(pathname);
    if (!chave) return;
    if (!usuarioTemMenu(menusSet, chave)) {
      router.replace("/inicio");
    }
  }, [pathname, router, menusLiberados]);

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

  return (
    <div className="wrapper">
      <nav className="main-header navbar navbar-expand border-bottom-0">
        <ul className="navbar-nav">
          <li className="nav-item">
            <a
              ref={hamburgerRef}
              className="nav-link"
              href="#"
              role="button"
              title="Alternar menu"
              aria-label="Alternar menu lateral"
              onClick={alternarMenuLateral}
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

      <aside
        ref={sidebarRef}
        className="main-sidebar sidebar-dark-primary elevation-4"
        onMouseLeave={fecharExpandidoPorClique}
      >
        <Link href="/inicio" className="brand-link">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/LogoSemFundo.png"
            alt="Podoquiro"
            className="brand-image"
          />
          <span className="brand-text font-weight-light">Podoquiro</span>
        </Link>
        <div className="sidebar">
          <nav className="mt-2">
            <DashboardSidebarNav
              pathname={pathname}
              menus={menusSet}
              onNavigate={fecharMenuMobile}
            />
          </nav>
        </div>
      </aside>

      <div
        id="sidebar-overlay"
        role="presentation"
        onClick={fecharMenuMobile}
      />

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
