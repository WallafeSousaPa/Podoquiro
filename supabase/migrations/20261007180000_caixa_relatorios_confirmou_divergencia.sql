-- Grava no fechamento se o usuário confirmou sobra/falta e o esperado do sistema na hora.

alter table public.caixa_relatorios
  add column if not exists confirmou_divergencia boolean not null default false;

alter table public.caixa_relatorios
  add column if not exists esperado_dinheiro numeric(14, 2) not null default 0;

alter table public.caixa_relatorios
  add column if not exists esperado_cartao_credito numeric(14, 2) not null default 0;

alter table public.caixa_relatorios
  add column if not exists esperado_cartao_debito numeric(14, 2) not null default 0;

alter table public.caixa_relatorios
  add column if not exists esperado_pix numeric(14, 2) not null default 0;

alter table public.caixa_relatorios
  add column if not exists esperado_link_pagamento numeric(14, 2) not null default 0;

comment on column public.caixa_relatorios.confirmou_divergencia is
  'True quando o usuário confirmou sobra ou falta no fechamento (Salvar mesmo assim).';
comment on column public.caixa_relatorios.esperado_dinheiro is
  'Total do sistema (dinheiro) no momento do fechamento.';
comment on column public.caixa_relatorios.esperado_cartao_credito is
  'Total do sistema (crédito) no momento do fechamento.';
comment on column public.caixa_relatorios.esperado_cartao_debito is
  'Total do sistema (débito) no momento do fechamento.';
comment on column public.caixa_relatorios.esperado_pix is
  'Total do sistema (PIX) no momento do fechamento.';
comment on column public.caixa_relatorios.esperado_link_pagamento is
  'Total do sistema (link) no momento do fechamento.';

update public.caixa_relatorios cr
set
  esperado_dinheiro = round(coalesce((r.esp ->> 'dinheiro')::numeric, 0), 2),
  esperado_cartao_credito = round(coalesce((r.esp ->> 'cartao_credito')::numeric, 0), 2),
  esperado_cartao_debito = round(coalesce((r.esp ->> 'cartao_debito')::numeric, 0), 2),
  esperado_pix = round(coalesce((r.esp ->> 'pix')::numeric, 0), 2),
  esperado_link_pagamento = round(coalesce((r.esp ->> 'link_pagamento')::numeric, 0), 2),
  confirmou_divergencia = (
    round(cr.valor_dinheiro, 2)
      is distinct from round(coalesce((r.esp ->> 'dinheiro')::numeric, 0), 2)
    or round(cr.valor_cartao_credito, 2)
      is distinct from round(coalesce((r.esp ->> 'cartao_credito')::numeric, 0), 2)
    or round(cr.valor_cartao_debito, 2)
      is distinct from round(coalesce((r.esp ->> 'cartao_debito')::numeric, 0), 2)
    or round(cr.valor_pix, 2)
      is distinct from round(coalesce((r.esp ->> 'pix')::numeric, 0), 2)
    or round(coalesce(cr.valor_link_pagamento, 0), 2)
      is distinct from round(coalesce((r.esp ->> 'link_pagamento')::numeric, 0), 2)
  )
from (
  select
    cr2.id,
    public.caixa_resumo_pagamentos_dia(cr2.id_empresa, cr2.data_referencia, null) -> 'esperado' as esp
  from public.caixa_relatorios cr2
) r
where cr.id = r.id;

drop function if exists public.caixa_fechar_com_relatorio(
  bigint, date, bigint, numeric, numeric, numeric, numeric, numeric
);

create or replace function public.caixa_fechar_com_relatorio(
  p_id_empresa bigint,
  p_data_referencia date,
  p_id_responsavel bigint,
  p_valor_dinheiro numeric,
  p_valor_cartao_credito numeric,
  p_valor_cartao_debito numeric,
  p_valor_pix numeric,
  p_valor_link_pagamento numeric default 0,
  p_confirmou_divergencia boolean default false,
  p_esperado_dinheiro numeric default 0,
  p_esperado_cartao_credito numeric default 0,
  p_esperado_cartao_debito numeric default 0,
  p_esperado_pix numeric default 0,
  p_esperado_link_pagamento numeric default 0
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
     or coalesce(p_esperado_dinheiro, -1) < 0
     or coalesce(p_esperado_cartao_credito, -1) < 0
     or coalesce(p_esperado_cartao_debito, -1) < 0
     or coalesce(p_esperado_pix, -1) < 0
     or coalesce(p_esperado_link_pagamento, -1) < 0
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
    valor_link_pagamento,
    confirmou_divergencia,
    esperado_dinheiro,
    esperado_cartao_credito,
    esperado_cartao_debito,
    esperado_pix,
    esperado_link_pagamento
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
    round(coalesce(p_valor_link_pagamento, 0), 2),
    coalesce(p_confirmou_divergencia, false),
    round(coalesce(p_esperado_dinheiro, 0), 2),
    round(coalesce(p_esperado_cartao_credito, 0), 2),
    round(coalesce(p_esperado_cartao_debito, 0), 2),
    round(coalesce(p_esperado_pix, 0), 2),
    round(coalesce(p_esperado_link_pagamento, 0), 2)
  )
  returning id into v_rel;

  return query select v_lf, v_rel;
end;
$$;

comment on function public.caixa_fechar_com_relatorio is
  'Fecha o caixa aberto mais recente da data, grava o relatório e se o usuário confirmou sobra/falta.';
