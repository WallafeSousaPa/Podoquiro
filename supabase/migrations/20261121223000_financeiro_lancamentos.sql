-- Livro de entradas e saídas do caixa das lojas (Financeiro > Lançamentos).

create table if not exists public.financeiro_lancamentos (
  id bigint generated always as identity primary key,
  id_empresa bigint null references public.empresas (id) on delete cascade,
  id_usuario bigint not null references public.usuarios (id) on delete restrict,
  tipo text not null,
  natureza text not null,
  categoria text not null,
  motivo text not null,
  valor numeric(14, 2) not null,
  data_pagamento date not null,
  meio_pagamento text not null,
  meio_pagamento_2 text null,
  valor_meio_1 numeric(14, 2) null,
  valor_meio_2 numeric(14, 2) null,
  status text not null default 'pago',
  observacao text null,
  origem text not null default 'manual',
  chave_caixa text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financeiro_lancamentos_tipo_chk check (tipo in ('entrada', 'saida')),
  constraint financeiro_lancamentos_natureza_chk check (natureza in ('fixa', 'variavel', 'entrada')),
  constraint financeiro_lancamentos_status_chk check (status in ('pago', 'pendente')),
  constraint financeiro_lancamentos_origem_chk check (origem in ('manual', 'caixa')),
  constraint financeiro_lancamentos_valor_chk check (valor > 0),
  constraint financeiro_lancamentos_categoria_chk check (btrim(categoria) <> ''),
  constraint financeiro_lancamentos_motivo_chk check (btrim(motivo) <> ''),
  constraint financeiro_lancamentos_meio_chk check (btrim(meio_pagamento) <> ''),
  constraint financeiro_lancamentos_natureza_tipo_chk check (
    (tipo = 'entrada' and natureza = 'entrada')
    or (tipo = 'saida' and natureza in ('fixa', 'variavel'))
  ),
  constraint financeiro_lancamentos_split_chk check (
    (
      meio_pagamento_2 is null
      and valor_meio_1 is null
      and valor_meio_2 is null
    )
    or (
      meio_pagamento_2 is not null
      and btrim(meio_pagamento_2) <> ''
      and valor_meio_1 is not null
      and valor_meio_2 is not null
      and valor_meio_1 >= 0
      and valor_meio_2 >= 0
      and round(valor_meio_1 + valor_meio_2, 2) = round(valor, 2)
    )
  )
);

create index if not exists financeiro_lancamentos_data_idx
  on public.financeiro_lancamentos (data_pagamento desc, id desc);

create index if not exists financeiro_lancamentos_empresa_idx
  on public.financeiro_lancamentos (id_empresa, data_pagamento desc);

create unique index if not exists financeiro_lancamentos_chave_caixa_uq
  on public.financeiro_lancamentos (chave_caixa)
  where chave_caixa is not null;

comment on table public.financeiro_lancamentos is
  'Entradas e saídas do caixa da loja. Entrada pode ser manual ou importada do que o caixa já recebeu.';

alter table public.financeiro_lancamentos enable row level security;

-- Recebidos no período, no mesmo critério do resumo do caixa, sem o fundo de abertura.
create or replace function public.financeiro_recebidos_caixa_periodo(
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
  'Soma o que o caixa recebeu no período, por forma de pagamento, para importar em Financeiro > Lançamentos.';

insert into public.menu_permissoes_grupo (id_grupo, menu_chave)
select g.id_grupo, 'financeiro.lancamentos'
from public.menu_permissoes_grupo g
where g.menu_chave = 'financeiro.caixa-movimento'
on conflict (id_grupo, menu_chave) do nothing;

insert into public.menu_permissoes_usuario (id_usuario, menu_chave)
select u.id_usuario, 'financeiro.lancamentos'
from public.menu_permissoes_usuario u
where u.menu_chave = 'financeiro.caixa-movimento'
on conflict (id_usuario, menu_chave) do nothing;
