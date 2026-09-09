/** Catálogo dos itens do menu lateral. Chaves estáveis gravadas na base. */

export type MenuLateralItem = {
  chave: string;
  label: string;
  href: string;
  /** Prefixos de rota cobertos por este item (o mais específico vence). */
  rotas: string[];
};

export type MenuLateralGrupo = {
  id: string;
  label: string;
  icon: string;
  /** Item único no primeiro nível (Início, Ponto). */
  item?: MenuLateralItem;
  itens?: MenuLateralItem[];
};

export const MENUS_LATERAIS: MenuLateralGrupo[] = [
  {
    id: "inicio",
    label: "Início",
    icon: "fas fa-home",
    item: { chave: "inicio", label: "Início", href: "/inicio", rotas: ["/inicio"] },
  },
  {
    id: "atendimentos",
    label: "Atendimentos",
    icon: "fas fa-notes-medical",
    itens: [
      {
        chave: "atendimentos.agendamentos",
        label: "Agendamentos",
        href: "/atendimentos/confirmar",
        rotas: ["/atendimentos/confirmar", "/atendimentos/agendar"],
      },
      {
        chave: "atendimentos.atendimento",
        label: "Atendimento",
        href: "/atendimentos/atendimento",
        rotas: ["/atendimentos/atendimento"],
      },
    ],
  },
  {
    id: "usuarios",
    label: "Usuários",
    icon: "fas fa-users",
    itens: [
      {
        chave: "usuarios.cadastro",
        label: "Cadastro",
        href: "/usuarios/cadastro",
        rotas: ["/usuarios/cadastro"],
      },
      {
        chave: "usuarios.grupos",
        label: "Grupo de usuários",
        href: "/usuarios/grupos",
        rotas: ["/usuarios/grupos"],
      },
      {
        chave: "usuarios.colaboradores",
        label: "Colaboradores",
        href: "/usuarios/colaboradores",
        rotas: ["/usuarios/colaboradores"],
      },
      {
        chave: "usuarios.menus",
        label: "Menus",
        href: "/usuarios/menus",
        rotas: ["/usuarios/menus"],
      },
    ],
  },
  {
    id: "pacientes",
    label: "Pacientes",
    icon: "fas fa-user-injured",
    itens: [
      {
        chave: "pacientes.cadastro",
        label: "Cadastrar",
        href: "/pacientes/cadastro",
        rotas: ["/pacientes/cadastro"],
      },
      {
        chave: "pacientes.avaliacoes",
        label: "Avaliações",
        href: "/pacientes/avaliacoes",
        rotas: ["/pacientes/avaliacoes"],
      },
    ],
  },
  {
    id: "procedimentos",
    label: "Procedimentos",
    icon: "fas fa-notes-medical",
    itens: [
      {
        chave: "procedimentos.cadastro",
        label: "Cadastrar",
        href: "/procedimentos/cadastro",
        rotas: ["/procedimentos/cadastro"],
      },
    ],
  },
  {
    id: "estoque",
    label: "Estoque",
    icon: "fas fa-boxes",
    itens: [
      {
        chave: "estoque.cadastro",
        label: "Cadastro",
        href: "/estoque/cadastro",
        rotas: ["/estoque/cadastro"],
      },
      {
        chave: "estoque.importacao",
        label: "Importação",
        href: "/estoque/importacao",
        rotas: ["/estoque/importacao"],
      },
      {
        chave: "estoque.saidas",
        label: "Saídas",
        href: "/estoque/saidas",
        rotas: ["/estoque/saidas"],
      },
    ],
  },
  {
    id: "ponto",
    label: "Ponto",
    icon: "fas fa-fingerprint",
    item: { chave: "ponto", label: "Ponto", href: "/ponto", rotas: ["/ponto"] },
  },
  {
    id: "nota-fiscal",
    label: "Nota Fiscal",
    icon: "fas fa-file-invoice",
    itens: [
      {
        chave: "nota-fiscal.emissao",
        label: "Emissão",
        href: "/nota-fiscal/emissao",
        rotas: ["/nota-fiscal/emissao"],
      },
      {
        chave: "nota-fiscal.consultar",
        label: "Consultar",
        href: "/nota-fiscal/consultar",
        rotas: ["/nota-fiscal/consultar"],
      },
      {
        chave: "nota-fiscal.nfce",
        label: "NFCe",
        href: "/nota-fiscal/nfce",
        rotas: ["/nota-fiscal/nfce"],
      },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: "fas fa-coins",
    itens: [
      {
        chave: "financeiro.caixa",
        label: "Caixa",
        href: "/financeiro/caixa",
        rotas: ["/financeiro/caixa"],
      },
      {
        chave: "financeiro.caixa-movimento",
        label: "Caixa Movimento",
        href: "/financeiro/caixa-movimento",
        rotas: ["/financeiro/caixa-movimento"],
      },
      {
        chave: "financeiro.parametrizacao.maquinetas",
        label: "Maquinetas",
        href: "/financeiro/parametrizacao/maquinetas",
        rotas: ["/financeiro/parametrizacao/maquinetas"],
      },
      {
        chave: "financeiro.parametrizacao.bandeiras",
        label: "Bandeiras",
        href: "/financeiro/parametrizacao/bandeiras",
        rotas: ["/financeiro/parametrizacao/bandeiras"],
      },
      {
        chave: "financeiro.parametrizacao.tipos-pagamento",
        label: "Tipos de pagamento",
        href: "/financeiro/parametrizacao/tipos-pagamento",
        rotas: ["/financeiro/parametrizacao/tipos-pagamento"],
      },
    ],
  },
  {
    id: "relatorios",
    label: "Relatórios",
    icon: "fas fa-chart-bar",
    itens: [
      {
        chave: "relatorios.caixa",
        label: "Relatório caixa",
        href: "/relatorios/caixa",
        rotas: ["/relatorios/caixa"],
      },
      {
        chave: "relatorios.atendimentos",
        label: "Atendimentos",
        href: "/relatorios/atendimentos",
        rotas: ["/relatorios/atendimentos"],
      },
      {
        chave: "relatorios.clientes-ausentes",
        label: "Clientes ausentes",
        href: "/relatorios/clientes-ausentes",
        rotas: ["/relatorios/clientes-ausentes"],
      },
      {
        chave: "relatorios.intervalos-vagos",
        label: "Intervalos vagos",
        href: "/relatorios/intervalos-vagos",
        rotas: ["/relatorios/intervalos-vagos"],
      },
      {
        chave: "relatorios.comparativo",
        label: "Comparativo",
        href: "/relatorios/comparativo",
        rotas: ["/relatorios/comparativo"],
      },
      {
        chave: "relatorios.links-pagos",
        label: "Links pagos",
        href: "/relatorios/links-pagos",
        rotas: ["/relatorios/links-pagos"],
      },
    ],
  },
  {
    id: "empresas",
    label: "Empresas",
    icon: "fas fa-building",
    itens: [
      {
        chave: "empresas.cadastro",
        label: "Cadastrar empresa",
        href: "/empresas/cadastro",
        rotas: ["/empresas/cadastro"],
      },
      {
        chave: "empresas.salas",
        label: "Salas",
        href: "/empresas/salas",
        rotas: ["/empresas/salas"],
      },
      {
        chave: "empresas.grupos",
        label: "Grupo de empresas",
        href: "/empresas/grupos",
        rotas: ["/empresas/grupos"],
      },
    ],
  },
];

export function todosItensMenuLateral(): MenuLateralItem[] {
  const out: MenuLateralItem[] = [];
  for (const g of MENUS_LATERAIS) {
    if (g.item) out.push(g.item);
    if (g.itens) out.push(...g.itens);
  }
  return out;
}

export const CHAVES_MENU_LATERAL = todosItensMenuLateral().map((i) => i.chave);

const CHAVES_SET = new Set(CHAVES_MENU_LATERAL);

export function isChaveMenuLateral(v: string): boolean {
  return CHAVES_SET.has(v);
}

function rotaCobre(pathname: string, rota: string): boolean {
  return pathname === rota || pathname.startsWith(`${rota}/`);
}

/** Menu exigido pela rota, ou `null` se a rota não entra no controle do menu (ex.: alterar senha). */
export function chaveMenuPorPathname(pathname: string): string | null {
  if (pathname === "/conta/senha" || pathname.startsWith("/conta/senha/")) return null;
  let melhor: { chave: string; len: number } | null = null;
  for (const item of todosItensMenuLateral()) {
    for (const rota of item.rotas) {
      if (rotaCobre(pathname, rota) && (!melhor || rota.length > melhor.len)) {
        melhor = { chave: item.chave, len: rota.length };
      }
    }
  }
  return melhor?.chave ?? null;
}

export function usuarioTemMenu(menus: ReadonlySet<string> | string[], chave: string): boolean {
  if (Array.isArray(menus)) return menus.includes(chave);
  return menus.has(chave);
}

export function usuarioTemMenuPrefixo(
  menus: ReadonlySet<string> | string[],
  prefixo: string,
): boolean {
  const set = Array.isArray(menus) ? new Set(menus) : menus;
  for (const c of set) {
    if (c === prefixo || c.startsWith(`${prefixo}.`)) return true;
  }
  return false;
}
