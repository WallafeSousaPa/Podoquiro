-- Produtos / estoque com campos fiscais para NF-e (Simples Nacional).
create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  id_empresa bigint not null references public.empresas (id) on delete cascade,

  sku varchar(50),
  barcode varchar(14),
  produto varchar(255) not null,
  descricao text,
  un_medida varchar(10) not null default 'UN',
  preco numeric(10, 2) not null,
  qtd_estoque integer not null default 0,

  ncm varchar(8) not null,
  cest varchar(7),
  origem smallint not null default 0,

  csosn varchar(3) not null default '102',
  cfop varchar(4) not null default '5102',

  pis_cst varchar(2) default '07',
  cofins_cst varchar(2) default '07',

  ativo boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint produtos_produto_nao_vazio check (btrim(produto) <> ''),
  constraint produtos_preco_nao_negativo check (preco >= 0),
  constraint produtos_estoque_nao_negativo check (qtd_estoque >= 0),
  constraint produtos_origem_range check (origem >= 0 and origem <= 8)
);

-- SKU único por empresa (várias empresas podem usar o mesmo código).
create unique index if not exists produtos_id_empresa_sku_uq
  on public.produtos (id_empresa, sku)
  where sku is not null;

create index if not exists produtos_id_empresa_idx on public.produtos (id_empresa);
create index if not exists produtos_ativo_idx on public.produtos (ativo);

comment on table public.produtos is 'Cadastro de produtos para estoque e emissão de NF-e.';

create or replace function public.touch_produtos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists produtos_set_updated_at on public.produtos;
create trigger produtos_set_updated_at
before update on public.produtos
for each row
execute function public.touch_produtos_updated_at();
