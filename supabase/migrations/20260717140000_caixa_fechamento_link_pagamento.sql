-- Link de pagamento no fechamento de caixa: taxas online (Asaas/Rede) entram
-- no meio próprio, separado de PIX/cartão físicos do atendimento.

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
      'link_pagamento',
      'outros'
    )
  );

alter table public.caixa_relatorios
  add column if not exists valor_link_pagamento numeric(14, 2) not null default 0;

alter table public.caixa_relatorios
  drop constraint if exists caixa_relatorios_valores_nao_neg;

alter table public.caixa_relatorios
  add constraint caixa_relatorios_valores_nao_neg check (
    valor_dinheiro >= 0
    and valor_cartao_credito >= 0
    and valor_cartao_debito >= 0
    and valor_pix >= 0
    and valor_link_pagamento >= 0
  );

comment on column public.caixa_relatorios.valor_link_pagamento is
  'Total conferido de links de pagamento (taxa online) no fechamento.';

drop function if exists public.caixa_fechar_com_relatorio(
  bigint, date, bigint, numeric, numeric, numeric, numeric
);

create or replace function public.caixa_fechar_com_relatorio(
  p_id_empresa bigint,
  p_data_referencia date,
  p_id_responsavel bigint,
  p_valor_dinheiro numeric,
  p_valor_cartao_credito numeric,
  p_valor_cartao_debito numeric,
  p_valor_pix numeric,
  p_valor_link_pagamento numeric default 0
)
returns table (id_lancamento bigint, id_relatorio bigint)
language plpgsql
as $$
declare
  v_lf bigint;
  v_rel bigint;
  v_numero_caixa text;
begin
  select a.numero_caixa
    into v_numero_caixa
    from public.caixa_lancamentos a
   where a.id_empresa = p_id_empresa
     and a.data_referencia = p_data_referencia
     and a.tipo = 'abertura'::public.caixa_lancamento_tipo
     and not exists (
       select 1
         from public.caixa_lancamentos f
        where f.id_empresa = a.id_empresa
          and f.data_referencia = a.data_referencia
          and f.numero_caixa = a.numero_caixa
          and f.tipo = 'fechamento'::public.caixa_lancamento_tipo
     )
   order by a.data_lancamento desc
   limit 1;

  if v_numero_caixa is null then
    raise exception 'CAIXA_NAO_ABERTO'
      using hint = 'Abra um caixa desta data antes de fechar.';
  end if;

  if coalesce(p_valor_dinheiro, -1) < 0
     or coalesce(p_valor_cartao_credito, -1) < 0
     or coalesce(p_valor_cartao_debito, -1) < 0
     or coalesce(p_valor_pix, -1) < 0
     or coalesce(p_valor_link_pagamento, -1) < 0
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
    v_numero_caixa,
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
    valor_pix,
    valor_link_pagamento
  )
  values (
    p_id_empresa,
    p_id_responsavel,
    v_lf,
    p_data_referencia,
    round(p_valor_dinheiro, 2),
    round(p_valor_cartao_credito, 2),
    round(p_valor_cartao_debito, 2),
    round(p_valor_pix, 2),
    round(coalesce(p_valor_link_pagamento, 0), 2)
  )
  returning id into v_rel;

  return query select v_lf, v_rel;
end;
$$;

comment on function public.caixa_fechar_com_relatorio is
  'Fecha o caixa aberto mais recente da data e grava o relatório (inclui link de pagamento).';

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
        when lower(f.nome) like '%link%' then 'link_pagamento'
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
      case
        when cm.tipo_entrada = 'taxa_agendamento'
          and coalesce(t.pago_em_dinheiro, false) = false
          then coalesce(nullif(trim(cm.forma_pagamento), ''), 'Link pagamento')
        else cm.forma_pagamento
      end as nome_forma,
      case
        when cm.tipo_entrada = 'taxa_agendamento'
          and coalesce(t.pago_em_dinheiro, false) = false
          then 'link_pagamento'
        when lower(cm.forma_pagamento) like '%link%' then 'link_pagamento'
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
    left join public.agendamento_taxa_rede t on t.id = cm.id_taxa_rede
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
      coalesce(sum(valor) filter (where bucket = 'link_pagamento'), 0) as link_pagamento,
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
      'link_pagamento', (select link_pagamento from tot),
      'outros', (select outros from tot)
    ),
    'por_forma', coalesce((select j from pf), '[]'::jsonb)
  );
$$;

comment on function public.caixa_resumo_pagamentos_dia is
  'Totais do dia: pagamentos, taxas online em link_pagamento, fundo só da abertura aberta.';
