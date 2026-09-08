-- Saídas de estoque (venda, transferência, perda, avulso),
-- cadastro de fornecedores e compradores, e origens de movimentação.

create table if not exists public.estoque_fornecedores (
  id uuid primary key default gen_random_uuid(),
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  nome text not null,
  razao_social text,
  fantasia text,
  doc varchar(14) not null,
  tipo_doc varchar(4) not null,
  ie text,
  email text,
  fone text,
  cep varchar(8),
  endereco text,
  numero text,
  complemento text,
  bairro text,
  municipio text,
  uf varchar(2),
  ativo boolean not null default true,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estoque_fornecedores_tipo_doc_chk check (tipo_doc in ('CPF', 'CNPJ')),
  constraint estoque_fornecedores_doc_chk check (doc ~ '^[0-9]{11}$' or doc ~ '^[0-9]{14}$')
);

create unique index if not exists estoque_fornecedores_empresa_doc_uq
  on public.estoque_fornecedores (id_empresa, doc);

create index if not exists estoque_fornecedores_empresa_idx
  on public.estoque_fornecedores (id_empresa, nome);

comment on table public.estoque_fornecedores is
  'Fornecedores da empresa, para compras e conferência de NF-e.';

create table if not exists public.estoque_compradores (
  id uuid primary key default gen_random_uuid(),
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  nome text not null,
  razao_social text,
  fantasia text,
  doc varchar(14) not null,
  tipo_doc varchar(4) not null,
  ie text,
  email text,
  fone text,
  cep varchar(8),
  endereco text,
  numero text,
  complemento text,
  bairro text,
  municipio text,
  uf varchar(2),
  ativo boolean not null default true,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estoque_compradores_tipo_doc_chk check (tipo_doc in ('CPF', 'CNPJ')),
  constraint estoque_compradores_doc_chk check (doc ~ '^[0-9]{11}$' or doc ~ '^[0-9]{14}$')
);

create unique index if not exists estoque_compradores_empresa_doc_uq
  on public.estoque_compradores (id_empresa, doc);

create index if not exists estoque_compradores_empresa_idx
  on public.estoque_compradores (id_empresa, nome);

comment on table public.estoque_compradores is
  'Compradores / destinatários para saídas de estoque e futura nota de venda.';

create table if not exists public.estoque_saidas (
  id uuid primary key default gen_random_uuid(),
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  tipo text not null,
  status text not null default 'confirmada',
  data_saida timestamptz not null default now(),
  id_comprador uuid null references public.estoque_compradores (id) on delete set null,
  id_fornecedor uuid null references public.estoque_fornecedores (id) on delete set null,
  id_empresa_destino bigint null references public.empresas (id) on delete set null,
  observacao text,

  emit_cnpj varchar(14),
  emit_nome text,
  emit_fantasia text,
  emit_uf varchar(2),
  emit_municipio text,
  emit_endereco text,
  emit_numero text,
  emit_complemento text,
  emit_bairro text,
  emit_cep varchar(8),

  dest_doc varchar(14),
  dest_tipo varchar(4),
  dest_nome text,
  dest_ie text,
  dest_uf varchar(2),
  dest_municipio text,
  dest_endereco text,
  dest_numero text,
  dest_complemento text,
  dest_bairro text,
  dest_cep varchar(8),
  dest_email text,
  dest_fone text,

  valor_total numeric(14, 2) not null default 0,
  nota_venda_status text not null default 'nao_aplicavel',
  payload_nota_venda jsonb,
  id_nfe_emissao uuid null references public.nfe_emissoes (id) on delete set null,
  id_usuario bigint null references public.usuarios (id) on delete set null,
  cancelada_em timestamptz,
  id_usuario_cancelamento bigint null references public.usuarios (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint estoque_saidas_tipo_chk check (
    tipo in ('venda', 'transferencia', 'perda', 'avulso')
  ),
  constraint estoque_saidas_status_chk check (status in ('confirmada', 'cancelada')),
  constraint estoque_saidas_nota_chk check (
    nota_venda_status in ('nao_aplicavel', 'pronta', 'gerada')
  ),
  constraint estoque_saidas_dest_tipo_chk check (
    dest_tipo is null or dest_tipo in ('CPF', 'CNPJ')
  )
);

create index if not exists estoque_saidas_empresa_idx
  on public.estoque_saidas (id_empresa, created_at desc);

create index if not exists estoque_saidas_tipo_idx
  on public.estoque_saidas (id_empresa, tipo, created_at desc);

create index if not exists estoque_saidas_comprador_idx
  on public.estoque_saidas (id_comprador);

comment on table public.estoque_saidas is
  'Saídas de mercadoria do estoque. Venda guarda payload pronto para futura NF-e (ainda não emitida).';

create table if not exists public.estoque_saida_itens (
  id uuid primary key default gen_random_uuid(),
  id_saida uuid not null references public.estoque_saidas (id) on delete cascade,
  n_item integer not null,
  id_produto uuid null references public.produtos (id) on delete set null,
  produto text not null,
  sku text,
  barcode text,
  ncm varchar(8),
  cfop varchar(4),
  un_medida varchar(10),
  qtd integer not null,
  v_un numeric(14, 4) not null default 0,
  v_total numeric(14, 2) not null default 0,
  saldo_anterior integer,
  saldo_posterior integer,
  created_at timestamptz not null default now(),
  constraint estoque_saida_itens_qtd_chk check (qtd > 0)
);

create index if not exists estoque_saida_itens_saida_idx
  on public.estoque_saida_itens (id_saida, n_item);

comment on table public.estoque_saida_itens is
  'Itens da saída de estoque, com snapshot do produto e saldo após a baixa.';

create or replace function public.touch_estoque_saidas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists estoque_saidas_set_updated_at on public.estoque_saidas;
create trigger estoque_saidas_set_updated_at
before update on public.estoque_saidas
for each row
execute function public.touch_estoque_saidas_updated_at();

create or replace function public.touch_estoque_parceiros_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists estoque_fornecedores_set_updated_at on public.estoque_fornecedores;
create trigger estoque_fornecedores_set_updated_at
before update on public.estoque_fornecedores
for each row
execute function public.touch_estoque_parceiros_updated_at();

drop trigger if exists estoque_compradores_set_updated_at on public.estoque_compradores;
create trigger estoque_compradores_set_updated_at
before update on public.estoque_compradores
for each row
execute function public.touch_estoque_parceiros_updated_at();

alter table public.estoque_fornecedores enable row level security;
alter table public.estoque_compradores enable row level security;
alter table public.estoque_saidas enable row level security;
alter table public.estoque_saida_itens enable row level security;

alter table public.produtos_movimentacao_estoque
  drop constraint if exists produtos_movimentacao_estoque_origem_chk;

alter table public.produtos_movimentacao_estoque
  add constraint produtos_movimentacao_estoque_origem_chk check (
    origem in (
      'cadastro',
      'ajuste_manual',
      'venda_atendimento',
      'estorno_atendimento',
      'importacao_nfe',
      'estorno_importacao_nfe',
      'saida_venda',
      'saida_transferencia',
      'saida_perda',
      'saida_avulso',
      'estorno_saida'
    )
  );
