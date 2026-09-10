-- Tabelas de preço: cada loja escolhe uma tabela; cada produto pode ter preço em várias tabelas.

create table if not exists public.tabelas_preco (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tabelas_preco_nome_nao_vazio check (btrim(nome) <> '')
);

create unique index if not exists tabelas_preco_nome_uq
  on public.tabelas_preco (lower(btrim(nome)));

comment on table public.tabelas_preco is
  'Regras de preço (ex.: Tabela Padrão, Tabela Loja A, Atacado). A loja escolhe qual usar nas vendas.';

create table if not exists public.produto_tabela_preco (
  id uuid primary key default gen_random_uuid(),
  id_produto uuid not null references public.produtos (id) on delete cascade,
  id_tabela_preco uuid not null references public.tabelas_preco (id) on delete cascade,
  preco_venda numeric(12, 2) not null,
  percentual_sobre_custo numeric(8, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint produto_tabela_preco_venda_nao_negativo check (preco_venda >= 0),
  constraint produto_tabela_preco_pct_nao_negativo check (
    percentual_sobre_custo is null or percentual_sobre_custo >= 0
  ),
  unique (id_produto, id_tabela_preco)
);

create index if not exists produto_tabela_preco_tabela_idx
  on public.produto_tabela_preco (id_tabela_preco);

comment on table public.produto_tabela_preco is
  'Preço de venda do produto em uma tabela específica.';

alter table public.empresas
  add column if not exists tabela_preco_id uuid references public.tabelas_preco (id) on delete set null;

create index if not exists empresas_tabela_preco_idx
  on public.empresas (tabela_preco_id);

comment on column public.empresas.tabela_preco_id is
  'Tabela de preço padrão da loja para PDV, saídas e nota fiscal.';

alter table public.tabelas_preco enable row level security;
alter table public.produto_tabela_preco enable row level security;

insert into public.tabelas_preco (nome, descricao)
select 'Tabela Padrão', 'Tabela inicial com os preços já cadastrados nos produtos.'
where not exists (
  select 1 from public.tabelas_preco where lower(btrim(nome)) = 'tabela padrão'
);

update public.empresas e
set tabela_preco_id = (
  select t.id from public.tabelas_preco t
  where lower(btrim(t.nome)) = 'tabela padrão'
  limit 1
)
where e.tabela_preco_id is null;

insert into public.produto_tabela_preco (
  id_produto,
  id_tabela_preco,
  preco_venda,
  percentual_sobre_custo
)
select
  p.id,
  e.tabela_preco_id,
  p.preco_venda,
  p.percentual_sobre_custo
from public.produtos p
join public.empresas e on e.id = p.id_empresa
where e.tabela_preco_id is not null
  and p.preco_venda is not null
  and p.preco_venda > 0
on conflict (id_produto, id_tabela_preco) do nothing;

insert into public.menu_permissoes_grupo (id_grupo, menu_chave)
select g.id, 'estoque.tabelas-preco'
from public.usuarios_grupos g
where lower(g.grupo_usuarios) like '%admin%'
   or exists (
     select 1 from public.menu_permissoes_grupo p
     where p.id_grupo = g.id and p.menu_chave = 'estoque.cadastro'
   )
on conflict do nothing;
