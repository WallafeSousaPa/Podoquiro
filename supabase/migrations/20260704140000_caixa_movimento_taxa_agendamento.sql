-- Vínculo com taxa de agendamento paga e backfill das taxas já quitadas.

alter table public.caixa_movimento
  add column if not exists id_taxa_rede bigint null
    references public.agendamento_taxa_rede (id) on delete set null;

create unique index if not exists caixa_movimento_id_taxa_rede_uq
  on public.caixa_movimento (id_taxa_rede)
  where id_taxa_rede is not null;

comment on column public.caixa_movimento.id_taxa_rede is
  'Taxa de agendamento que originou a entrada (confirmação em dinheiro, PIX, link, etc.).';

-- Backfill: taxas já pagas que ainda não geraram movimento.
insert into public.caixa_movimento (
  id_empresa,
  data_movimentacao,
  data_vencimento,
  descricao,
  tipo_entrada,
  forma_pagamento,
  parcela,
  valor,
  atendimento_id,
  id_pagamento,
  id_taxa_rede
)
select
  t.id_empresa,
  coalesce(t.pago_em, t.created_at),
  null,
  format(
    'Taxa agendamento #%s — agendamento #%s',
    t.id,
    t.id_agendamento
  ),
  'taxa_agendamento',
  case
    when t.pago_em_dinheiro then 'Dinheiro'
    when nullif(trim(t.rede_tid), '') is not null
      or nullif(trim(t.rede_payment_link_id), '') is not null then 'PIX'
    when nullif(trim(t.asaas_payment_link_id), '') is not null then 'Link pagamento'
    else 'Taxa agendamento'
  end,
  null,
  round(t.valor::numeric, 2),
  t.id_agendamento,
  null,
  t.id
from public.agendamento_taxa_rede t
where t.status = 'pago'
  and not exists (
    select 1
    from public.caixa_movimento cm
    where cm.id_taxa_rede = t.id
  );

-- Resumo do caixa: incluir taxas pagas na data (pago_em), não só pagamentos de atendimentos realizados.
create or replace function public.caixa_resumo_pagamentos_dia(
  p_id_empresa bigint,
  p_data date,
  p_id_usuario bigint default null
)
returns jsonb
language sql
stable
as $$
  with base as (
    select
      round(p.valor_pago::numeric, 2) as valor,
      f.nome as nome_forma,
      case
        when nullif(trim(f.agrupamento_caixa), '') is not null
          then trim(f.agrupamento_caixa)
        when lower(f.nome) like '%pix%' then 'pix'
        when lower(f.nome) like '%dinheiro%'
          or lower(f.nome) like '%esp%cie%'
          or lower(f.nome) like '%numerario%'
          or lower(f.nome) like '%numerário%' then 'dinheiro'
        when lower(f.nome) like '%d%bito%'
          or lower(f.nome) like '%debito%' then 'cartao_debito'
        when lower(f.nome) like '%cr%dito%'
          or lower(f.nome) like '%credito%' then 'cartao_credito'
        when lower(f.nome) like '%cart%' then 'cartao_credito'
        else 'outros'
      end as bucket
    from public.pagamentos p
    inner join public.agendamentos a on a.id = p.id_agendamento
    inner join public.formas_pagamento f on f.id = p.id_forma_pagamento
    where p.status_pagamento = 'pago'::public.pagamento_status
      and a.id_empresa = p_id_empresa
      and ((a.data_hora_inicio at time zone 'America/Sao_Paulo')::date) = p_data
      and (p_id_usuario is null or a.id_usuario = p_id_usuario)
      and not exists (
        select 1
        from public.agendamento_taxa_rede t
        where t.id_agendamento = a.id
          and t.status = 'pago'::public.agendamento_taxa_rede_status
          and t.pago_em_dinheiro
          and round(t.valor::numeric, 2) = round(p.valor_pago::numeric, 2)
      )

    union all

    select
      round(t.valor::numeric, 2) as valor,
      case
        when t.pago_em_dinheiro then 'Dinheiro'
        when nullif(trim(t.rede_tid), '') is not null
          or nullif(trim(t.rede_payment_link_id), '') is not null then 'PIX'
        when nullif(trim(t.asaas_payment_link_id), '') is not null then 'Link pagamento'
        else 'Taxa agendamento'
      end as nome_forma,
      case
        when t.pago_em_dinheiro then 'dinheiro'
        when nullif(trim(t.rede_tid), '') is not null
          or nullif(trim(t.rede_payment_link_id), '') is not null then 'pix'
        when nullif(trim(t.asaas_payment_link_id), '') is not null then 'outros'
        else 'outros'
      end as bucket
    from public.agendamento_taxa_rede t
    inner join public.agendamentos a on a.id = t.id_agendamento
    where t.status = 'pago'::public.agendamento_taxa_rede_status
      and t.id_empresa = p_id_empresa
      and t.pago_em is not null
      and ((t.pago_em at time zone 'America/Sao_Paulo')::date) = p_data
      and (p_id_usuario is null or a.id_usuario = p_id_usuario)
  ),
  tot as (
    select
      coalesce(sum(valor) filter (where bucket = 'dinheiro'), 0) as dinheiro,
      coalesce(sum(valor) filter (where bucket = 'pix'), 0) as pix,
      coalesce(sum(valor) filter (where bucket = 'cartao_credito'), 0) as cartao_credito,
      coalesce(sum(valor) filter (where bucket = 'cartao_debito'), 0) as cartao_debito,
      coalesce(sum(valor) filter (where bucket = 'outros'), 0) as outros
    from base
  ),
  pf as (
    select jsonb_agg(
      jsonb_build_object(
        'nome', nome_forma,
        'total', tot,
        'bucket', bucket
      )
      order by nome_forma
    ) as j
    from (
      select nome_forma, round(sum(valor), 2) as tot, min(bucket) as bucket
      from base
      group by nome_forma
    ) s
  )
  select jsonb_build_object(
    'esperado', jsonb_build_object(
      'dinheiro', (select dinheiro from tot),
      'pix', (select pix from tot),
      'cartao_credito', (select cartao_credito from tot),
      'cartao_debito', (select cartao_debito from tot),
      'outros', (select outros from tot)
    ),
    'por_forma', coalesce((select j from pf), '[]'::jsonb)
  );
$$;

comment on function public.caixa_resumo_pagamentos_dia is
  'Totais quitados no dia: pagamentos de atendimentos realizados + taxas de agendamento pagas (pago_em).';
