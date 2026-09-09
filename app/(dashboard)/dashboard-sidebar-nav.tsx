"use client";

import Link from "next/link";
import {
  MENUS_LATERAIS,
  type MenuLateralItem,
} from "@/lib/dashboard/menus-catalogo";
import { useEffect, useState } from "react";

function cx(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

function itemAtivo(pathname: string, item: MenuLateralItem): boolean {
  return item.rotas.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

type Props = {
  pathname: string;
  menus: ReadonlySet<string>;
  onNavigate: () => void;
};

export function DashboardSidebarNav({ pathname, menus, onNavigate }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const g of MENUS_LATERAIS) {
      const itens = g.item ? [g.item] : g.itens ?? [];
      next[g.id] = itens.some((i) => menus.has(i.chave) && itemAtivo(pathname, i));
    }
    setOpen(next);
  }, [pathname, menus]);

  return (
    <ul className="nav nav-pills nav-sidebar flex-column" role="navigation">
      {MENUS_LATERAIS.map((g) => {
        if (g.item) {
          if (!menus.has(g.item.chave)) return null;
          const ativo = itemAtivo(pathname, g.item);
          return (
            <li key={g.id} className="nav-item">
              <Link
                href={g.item.href}
                className={cx("nav-link", ativo && "active")}
                onClick={onNavigate}
              >
                <i className={`nav-icon ${g.icon}`} />
                <p>{g.label}</p>
              </Link>
            </li>
          );
        }

        const itens = (g.itens ?? []).filter((i) => menus.has(i.chave) && !i.somenteAcao);
        if (itens.length === 0) return null;

        const grupoAtivo = itens.some((i) => itemAtivo(pathname, i));
        const isFinanceiro = g.id === "financeiro";
        const principais = isFinanceiro
          ? itens.filter((i) => !i.chave.startsWith("financeiro.parametrizacao."))
          : itens;
        const params = isFinanceiro
          ? itens.filter((i) => i.chave.startsWith("financeiro.parametrizacao."))
          : [];
        const paramAberto = params.some((i) => itemAtivo(pathname, i));

        return (
          <li
            key={g.id}
            className={cx("nav-item", "has-treeview", open[g.id] && "menu-open")}
          >
            <a
              href="#"
              className={cx("nav-link", grupoAtivo && "active")}
              onClick={(e) => {
                e.preventDefault();
                setOpen((prev) => ({ ...prev, [g.id]: !prev[g.id] }));
              }}
            >
              <i className={`nav-icon ${g.icon}`} />
              <p>
                {g.label}
                <i className="right fas fa-angle-left" />
              </p>
            </a>
            <ul className="nav nav-treeview">
              {principais.map((item) => (
                <li key={item.chave} className="nav-item">
                  <Link
                    href={item.href}
                    className={cx("nav-link", itemAtivo(pathname, item) && "active")}
                    onClick={onNavigate}
                  >
                    <i className="far fa-circle nav-icon" />
                    <p>{item.label}</p>
                  </Link>
                </li>
              ))}
              {params.length > 0 ? (
                <li
                  className={cx(
                    "nav-item",
                    "has-treeview",
                    (open.parametrizacao || paramAberto) && "menu-open",
                  )}
                >
                  <a
                    href="#"
                    className={cx("nav-link", paramAberto && "active")}
                    onClick={(e) => {
                      e.preventDefault();
                      setOpen((prev) => ({
                        ...prev,
                        parametrizacao: !prev.parametrizacao,
                      }));
                    }}
                  >
                    <i className="far fa-circle nav-icon" />
                    <p>
                      Parametrização
                      <i className="right fas fa-angle-left" />
                    </p>
                  </a>
                  <ul className="nav nav-treeview">
                    {params.map((item) => (
                      <li key={item.chave} className="nav-item">
                        <Link
                          href={item.href}
                          className={cx("nav-link", itemAtivo(pathname, item) && "active")}
                          onClick={onNavigate}
                        >
                          <i className="far fa-dot-circle nav-icon" />
                          <p>{item.label}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
