-- Importação de NF-e (XML) para entrada de mercadorias no estoque.

create table if not exists public.estoque_nfe_importacoes (
  id uuid primary key default gen_random_uuid(),
  id_empresa bigint not null references public.empresas (id) on delete cascade,

  chave_acesso varchar(44) not null,
  numero_nf integer not null,
  serie smallint not null default 1,
  modelo smallint not null default 55,
  dh_emissao timestamptz,
  natureza_operacao text,

  emit_cnpj varchar(14),
  emit_nome text,
  emit_fantasia text,
  emit_ie text,
  emit_uf varchar(2),
  emit_municipio text,
  emit_endereco text,
  emit_fone text,

  dest_doc varchar(14),
  dest_tipo varchar(4),
  dest_nome text,
  dest_uf varchar(2),
  dest_municipio text,
  dest_endereco text,
  dest_email text,

  valor_produtos numeric(14, 2) not null default 0,
  valor_frete numeric(14, 2) not null default 0,
  valor_nf numeric(14, 2) not null default 0,

  xml_original text not null,
  status text not null default 'pendente',
  id_usuario bigint null references public.usuarios (id) on delete set null,
  entrada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint estoque_nfe_importacoes_chave_formato_chk check (
    chave_acesso ~ '^[0-9]{44}$'
  ),
  constraint estoque_nfe_importacoes_modelo_chk check (modelo in (55)),
  constraint estoque_nfe_importacoes_status_chk check (
    status in ('pendente', 'entrada_realizada')
  ),
  constraint estoque_nfe_importacoes_dest_tipo_chk check (
    dest_tipo is null or dest_tipo in ('CPF', 'CNPJ')
  )
);

create unique index if not exists estoque_nfe_importacoes_empresa_chave_uq
  on public.estoque_nfe_importacoes (id_empresa, chave_acesso);

create index if not exists estoque_nfe_importacoes_empresa_idx
  on public.estoque_nfe_importacoes (id_empresa, created_at desc);

comment on table public.estoque_nfe_importacoes is
  'NF-e (XML) importada para conferência e entrada de produtos no estoque.';

create table if not exists public.estoque_nfe_importacao_itens (
  id uuid primary key default gen_random_uuid(),
  id_importacao uuid not null references public.estoque_nfe_importacoes (id) on delete cascade,
  n_item integer not null,
  c_prod text,
  c_ean varchar(14),
  x_prod text not null,
  ncm varchar(8),
  cest varchar(7),
  cfop varchar(4),
  u_com varchar(10),
  q_com numeric(14, 4) not null,
  v_un_com numeric(14, 4) not null default 0,
  v_prod numeric(14, 2) not null default 0,
  v_frete numeric(14, 2),
  origem smallint,
  csosn varchar(3),
  id_produto uuid null references public.produtos (id) on delete set null,
  acao text,
  qtd_entrada integer,
  saldo_anterior integer,
  saldo_posterior integer,
  created_at timestamptz not null default now(),

  constraint estoque_nfe_importacao_itens_acao_chk check (
    acao is null or acao in ('cadastrado', 'atualizado')
  ),
  constraint estoque_nfe_importacao_itens_qtd_chk check (q_com >= 0)
);

create index if not exists estoque_nfe_importacao_itens_importacao_idx
  on public.estoque_nfe_importacao_itens (id_importacao, n_item);

comment on table public.estoque_nfe_importacao_itens is
  'Itens da NF-e importada; após a entrada, guarda o vínculo com produtos e o saldo.';

create or replace function public.touch_estoque_nfe_importacoes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists estoque_nfe_importacoes_set_updated_at on public.estoque_nfe_importacoes;
create trigger estoque_nfe_importacoes_set_updated_at
before update on public.estoque_nfe_importacoes
for each row
execute function public.touch_estoque_nfe_importacoes_updated_at();

alter table public.estoque_nfe_importacoes enable row level security;
alter table public.estoque_nfe_importacao_itens enable row level security;

alter table public.produtos_movimentacao_estoque
  drop constraint if exists produtos_movimentacao_estoque_origem_chk;

alter table public.produtos_movimentacao_estoque
  add constraint produtos_movimentacao_estoque_origem_chk check (
    origem in (
      'cadastro',
      'ajuste_manual',
      'venda_atendimento',
      'estorno_atendimento',
      'importacao_nfe'
    )
  );
