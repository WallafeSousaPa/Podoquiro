-- Agrupamento opcional por forma de pagamento para o fechamento de caixa (resumo do sistema).

alter table public.formas_pagamento
  add column if not exists agrupamento_caixa text null;

alter table public.formas_pagamento
  drop constraint if exists formas_pagamento_agrupamento_caixa_chk;

alter table public.formas_pagamento
  add constraint formas_pagamento_agrupamento_caixa_chk check (
    agrupamento_caixa is null
    or agrupamento_caixa in (
      'dinheiro',
      'pix',
      'cartao_credito',
      'cartao_debito',
      'outros'
    )
  );

comment on column public.formas_pagamento.agrupamento_caixa is
  'Opcional: como a forma entra no fechamento de caixa. Se null, infere pelo nome (Pix, dinheiro, cartões).';

-- Resumo dos pagamentos quitados no dia (fuso America/Sao_Paulo), por bucket e detalhe por forma.
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
  'Totais de pagamentos quitados no dia (data do agendamento em America/Sao_Paulo), por grupo do fechamento.';
