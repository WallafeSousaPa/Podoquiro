-- Controle de abertura/fechamento de caixa por dia e relatório de conferência no fechamento.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'caixa_lancamento_tipo') then
    create type public.caixa_lancamento_tipo as enum ('abertura', 'fechamento');
  end if;
end
$$;

create table if not exists public.caixa_lancamentos (
  id bigint generated always as identity primary key,
  numero_caixa text not null default '01',
  tipo public.caixa_lancamento_tipo not null,
  id_responsavel bigint not null references public.usuarios (id) on delete restrict,
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  data_lancamento timestamptz not null default now(),
  data_referencia date not null,
  constraint caixa_lancamentos_empresa_data_tipo_uq unique (id_empresa, data_referencia, tipo)
);

create index if not exists caixa_lancamentos_id_empresa_data_idx
  on public.caixa_lancamentos (id_empresa, data_referencia desc);

comment on table public.caixa_lancamentos is
  'Abertura e fechamento de caixa por empresa e data de referência (dia operacional).';
comment on column public.caixa_lancamentos.numero_caixa is
  'Identificador do caixa físico (ex.: 01).';
comment on column public.caixa_lancamentos.data_referencia is
  'Dia do movimento (fuso do negócio); abertura e fechamento do mesmo dia compartilham esta data.';

create table if not exists public.caixa_relatorios (
  id bigint generated always as identity primary key,
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  id_responsavel bigint not null references public.usuarios (id) on delete restrict,
  id_lancamento_fechamento bigint not null unique references public.caixa_lancamentos (id) on delete restrict,
  data_referencia date not null,
  valor_dinheiro numeric(14, 2) not null default 0,
  valor_cartao_credito numeric(14, 2) not null default 0,
  valor_cartao_debito numeric(14, 2) not null default 0,
  valor_pix numeric(14, 2) not null default 0,
  criado_em timestamptz not null default now(),
  constraint caixa_relatorios_valores_nao_neg check (
    valor_dinheiro >= 0
    and valor_cartao_credito >= 0
    and valor_cartao_debito >= 0
    and valor_pix >= 0
  )
);

create index if not exists caixa_relatorios_id_empresa_data_idx
  on public.caixa_relatorios (id_empresa, data_referencia desc);

comment on table public.caixa_relatorios is
  'Relatório de conferência gerado ao fechar o caixa (valores por meio de pagamento).';

create or replace function public.caixa_fechar_com_relatorio(
  p_id_empresa bigint,
  p_data_referencia date,
  p_id_responsavel bigint,
  p_valor_dinheiro numeric,
  p_valor_cartao_credito numeric,
  p_valor_cartao_debito numeric,
  p_valor_pix numeric
)
returns table (id_lancamento bigint, id_relatorio bigint)
language plpgsql
as $$
declare
  v_lf bigint;
  v_rel bigint;
begin
  if not exists (
    select 1
    from public.caixa_lancamentos c
    where c.id_empresa = p_id_empresa
      and c.data_referencia = p_data_referencia
      and c.tipo = 'abertura'::public.caixa_lancamento_tipo
  ) then
    raise exception 'CAIXA_NAO_ABERTO' using hint = 'Abra o caixa desta data antes de fechar.';
  end if;

  if exists (
    select 1
    from public.caixa_lancamentos c
    where c.id_empresa = p_id_empresa
      and c.data_referencia = p_data_referencia
      and c.tipo = 'fechamento'::public.caixa_lancamento_tipo
  ) then
    raise exception 'CAIXA_JA_FECHADO' using hint = 'O caixa desta data já foi fechado.';
  end if;

  if coalesce(p_valor_dinheiro, -1) < 0
     or coalesce(p_valor_cartao_credito, -1) < 0
     or coalesce(p_valor_cartao_debito, -1) < 0
     or coalesce(p_valor_pix, -1) < 0
  then
    raise exception 'VALORES_INVALIDOS' using hint = 'Informe valores numéricos ≥ 0.';
  end if;

  insert into public.caixa_lancamentos (
    numero_caixa,
    tipo,
    id_responsavel,
    id_empresa,
    data_referencia
  )
  values (
    '01',
    'fechamento'::public.caixa_lancamento_tipo,
    p_id_responsavel,
    p_id_empresa,
    p_data_referencia
  )
  returning id into v_lf;

  insert into public.caixa_relatorios (
    id_empresa,
    id_responsavel,
    id_lancamento_fechamento,
    data_referencia,
    valor_dinheiro,
    valor_cartao_credito,
    valor_cartao_debito,
    valor_pix
  )
  values (
    p_id_empresa,
    p_id_responsavel,
    v_lf,
    p_data_referencia,
    round(p_valor_dinheiro, 2),
    round(p_valor_cartao_credito, 2),
    round(p_valor_cartao_debito, 2),
    round(p_valor_pix, 2)
  )
  returning id into v_rel;

  return query select v_lf, v_rel;
end;
$$;

comment on function public.caixa_fechar_com_relatorio is
  'Fecha o caixa da data (um fechamento por empresa/data) e grava o relatório de conferência.';
