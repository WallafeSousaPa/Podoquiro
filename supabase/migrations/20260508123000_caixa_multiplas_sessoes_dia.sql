-- Permite múltiplas sessões de caixa por dia (01, 02, 03...), mantendo
-- no máximo um par abertura/fechamento por número de caixa.

alter table public.caixa_lancamentos
  drop constraint if exists caixa_lancamentos_empresa_data_tipo_uq;

alter table public.caixa_lancamentos
  add constraint caixa_lancamentos_empresa_data_numero_tipo_uq
  unique (id_empresa, data_referencia, numero_caixa, tipo);

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
  'Fecha o caixa aberto mais recente da data e grava o relatório de conferência.';
