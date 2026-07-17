-- Fundo de caixa no resumo do fechamento: contar só a abertura ainda aberta.
-- Antes, todos os fundos do dia eram somados e, ao reabrir o caixa com o mesmo
-- valor de troco, o esperado de dinheiro acumulava (ex.: 50 + 50 = 100).

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
      round(cm.valor::numeric, 2) as valor,
      cm.forma_pagamento as nome_forma,
      case
        when lower(cm.forma_pagamento) like '%pix%' then 'pix'
        when lower(cm.forma_pagamento) like '%dinheiro%'
          or lower(cm.forma_pagamento) like '%esp%cie%'
          or lower(cm.forma_pagamento) like '%numerario%'
          or lower(cm.forma_pagamento) like '%numerário%' then 'dinheiro'
        when lower(cm.forma_pagamento) like '%d%bito%'
          or lower(cm.forma_pagamento) like '%debito%' then 'cartao_debito'
        when lower(cm.forma_pagamento) like '%cr%dito%'
          or lower(cm.forma_pagamento) like '%credito%'
          or lower(cm.forma_pagamento) like '%cart%' then 'cartao_credito'
        when lower(cm.forma_pagamento) like '%boleto%' then 'outros'
        else 'outros'
      end as bucket
    from public.caixa_movimento cm
    left join public.agendamentos a on a.id = cm.atendimento_id
    where cm.id_empresa = p_id_empresa
      and ((cm.data_movimentacao at time zone 'America/Sao_Paulo')::date) = p_data
      and (
        (
          cm.tipo_entrada = 'taxa_agendamento'
          and (p_id_usuario is null or a.id_usuario = p_id_usuario)
        )
        or (
          cm.tipo_entrada = 'fundo_caixa'
          and exists (
            select 1
            from public.caixa_lancamentos ab
            where ab.id = cm.id_lancamento_caixa
              and ab.id_empresa = p_id_empresa
              and ab.data_referencia = p_data
              and ab.tipo = 'abertura'::public.caixa_lancamento_tipo
              and not exists (
                select 1
                from public.caixa_lancamentos fe
                where fe.id_empresa = ab.id_empresa
                  and fe.data_referencia = ab.data_referencia
                  and fe.numero_caixa = ab.numero_caixa
                  and fe.tipo = 'fechamento'::public.caixa_lancamento_tipo
              )
          )
        )
      )
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
  'Totais quitados no dia: pagamentos, taxas e fundo de caixa só da abertura ainda aberta.';
