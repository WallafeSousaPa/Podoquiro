-- A importação do caixa passa a lançar cada forma no dia em que o valor entrou,
-- e não mais numa única data de importação.

drop function if exists public.financeiro_recebidos_caixa_periodo(bigint, date, date);

create function public.financeiro_recebidos_caixa_periodo(
  p_id_empresa bigint,
  p_inicio date,
  p_fim date
)
returns table (data_recebimento date, nome_forma text, total numeric)
language sql
stable
as $$
  with base as (
    select
      ((a.data_hora_inicio at time zone 'America/Sao_Paulo')::date) as data_recebimento,
      round(p.valor_pago::numeric, 2) as valor,
      f.nome as nome_forma
    from public.pagamentos p
    inner join public.agendamentos a on a.id = p.id_agendamento
    inner join public.formas_pagamento f on f.id = p.id_forma_pagamento
    where p.status_pagamento = 'pago'::public.pagamento_status
      and a.id_empresa = p_id_empresa
      and ((a.data_hora_inicio at time zone 'America/Sao_Paulo')::date) between p_inicio and p_fim
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
      ((cm.data_movimentacao at time zone 'America/Sao_Paulo')::date) as data_recebimento,
      round(cm.valor::numeric, 2) as valor,
      case
        when cm.tipo_entrada = 'taxa_agendamento'
          and coalesce(t.pago_em_dinheiro, false) = false
          then coalesce(nullif(trim(cm.forma_pagamento), ''), 'Link pagamento')
        else cm.forma_pagamento
      end as nome_forma
    from public.caixa_movimento cm
    left join public.agendamento_taxa_rede t on t.id = cm.id_taxa_rede
    where cm.id_empresa = p_id_empresa
      and cm.tipo_entrada = 'taxa_agendamento'
      and ((cm.data_movimentacao at time zone 'America/Sao_Paulo')::date) between p_inicio and p_fim
  )
  select b.data_recebimento, b.nome_forma, round(sum(b.valor), 2) as total
  from base b
  where b.nome_forma is not null and btrim(b.nome_forma) <> ''
  group by b.data_recebimento, b.nome_forma
  having round(sum(b.valor), 2) > 0
  order by b.data_recebimento, b.nome_forma;
$$;

comment on function public.financeiro_recebidos_caixa_periodo is
  'Soma o que o caixa recebeu por dia e forma de pagamento.';

-- Troca o total do mês (gravado na data da importação) pelas linhas de cada dia.
insert into public.financeiro_lancamentos (
  id_empresa,
  id_usuario,
  tipo,
  natureza,
  categoria,
  motivo,
  valor,
  data_pagamento,
  meio_pagamento,
  status,
  observacao,
  origem,
  chave_caixa
)
select
  m.id_empresa,
  m.id_usuario,
  'entrada',
  'entrada',
  case
    when lower(translate(r.nome_forma, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) like '%pix%'
      then 'Receita Pix'
    when lower(translate(r.nome_forma, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) like '%debito%'
      then 'Receita Débito'
    when lower(translate(r.nome_forma, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) like '%credito%'
      or lower(translate(r.nome_forma, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) like '%cart%'
      then 'Receita Crédito'
    when lower(translate(r.nome_forma, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) like '%dinheiro%'
      or lower(translate(r.nome_forma, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) like '%especie%'
      or lower(translate(r.nome_forma, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) like '%numerario%'
      then 'Receita Dinheiro'
    when lower(translate(r.nome_forma, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) like '%link%'
      or lower(translate(r.nome_forma, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) like '%asaas%'
      then 'Receita Link'
    else 'Outras receitas'
  end,
  'Recebido no caixa — ' || r.nome_forma,
  r.total,
  r.data_recebimento,
  r.nome_forma,
  'pago',
  'Importado do caixa no dia do recebimento.',
  'caixa',
  'caixa:' || m.id_empresa::text || ':' || to_char(r.data_recebimento, 'YYYY-MM-DD') || ':'
    || lower(btrim(regexp_replace(r.nome_forma, '\s+', ' ', 'g')))
from (
  select distinct on (id_empresa, date_trunc('month', data_pagamento))
    id_empresa,
    id_usuario,
    date_trunc('month', data_pagamento)::date as inicio,
    (date_trunc('month', data_pagamento) + interval '1 month' - interval '1 day')::date as fim
  from public.financeiro_lancamentos
  where origem = 'caixa'
    and chave_caixa ~ '^caixa:[0-9]+:[0-9]{4}-[0-9]{2}:'
  order by id_empresa, date_trunc('month', data_pagamento), id
) m
cross join lateral public.financeiro_recebidos_caixa_periodo(m.id_empresa, m.inicio, m.fim) r;

delete from public.financeiro_lancamentos
where origem = 'caixa'
  and chave_caixa ~ '^caixa:[0-9]+:[0-9]{4}-[0-9]{2}:';
