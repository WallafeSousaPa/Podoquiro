-- Histórico de entradas e saídas de estoque por produto.

create table if not exists public.produtos_movimentacao_estoque (
  id bigint generated always as identity primary key,
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  id_produto uuid not null references public.produtos (id) on delete cascade,
  tipo text not null,
  quantidade numeric(14, 4) not null,
  saldo_anterior integer not null,
  saldo_posterior integer not null,
  origem text not null,
  id_agendamento bigint null references public.agendamentos (id) on delete set null,
  id_usuario bigint null references public.usuarios (id) on delete set null,
  observacao text null,
  created_at timestamptz not null default now(),
  constraint produtos_movimentacao_estoque_tipo_chk check (tipo in ('entrada', 'saida')),
  constraint produtos_movimentacao_estoque_origem_chk check (
    origem in ('cadastro', 'ajuste_manual', 'venda_atendimento', 'estorno_atendimento')
  ),
  constraint produtos_movimentacao_estoque_qtd_positiva check (quantidade > 0)
);

create index if not exists produtos_movimentacao_estoque_produto_idx
  on public.produtos_movimentacao_estoque (id_produto, created_at desc);

create index if not exists produtos_movimentacao_estoque_empresa_idx
  on public.produtos_movimentacao_estoque (id_empresa, created_at desc);

comment on table public.produtos_movimentacao_estoque is
  'Entradas e saídas de estoque (mercadorias), para histórico no cadastro de produtos.';

alter table public.produtos_movimentacao_estoque enable row level security;
