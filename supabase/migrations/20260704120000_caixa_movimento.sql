-- Movimentações de caixa (entradas e saídas) para contabilização.

create table if not exists public.caixa_movimento (
  id bigint generated always as identity primary key,
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  data_movimentacao timestamptz not null default now(),
  data_vencimento date null,
  descricao text not null,
  tipo_entrada text not null,
  forma_pagamento text not null,
  parcela text null,
  valor numeric(14, 2) not null,
  atendimento_id bigint null references public.agendamentos (id) on delete set null,
  id_pagamento bigint null references public.pagamentos (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint caixa_movimento_valor_positivo check (valor > 0),
  constraint caixa_movimento_descricao_nao_vazia check (btrim(descricao) <> '')
);

create index if not exists caixa_movimento_id_empresa_data_idx
  on public.caixa_movimento (id_empresa, data_movimentacao desc);

create index if not exists caixa_movimento_atendimento_idx
  on public.caixa_movimento (atendimento_id)
  where atendimento_id is not null;

create unique index if not exists caixa_movimento_id_pagamento_uq
  on public.caixa_movimento (id_pagamento)
  where id_pagamento is not null;

comment on table public.caixa_movimento is
  'Ledger de movimentações do caixa (entradas por baixa de atendimentos, etc.).';
comment on column public.caixa_movimento.tipo_entrada is
  'Origem da entrada (ex.: atendimento). Saídas futuras podem usar outro tipo.';
comment on column public.caixa_movimento.forma_pagamento is
  'Nome da forma de pagamento no momento da baixa (snapshot).';
comment on column public.caixa_movimento.parcela is
  'Parcela ou programação (ex.: 1/5), quando aplicável.';
comment on column public.caixa_movimento.data_vencimento is
  'Data prevista de recebimento, para entradas programadas.';
