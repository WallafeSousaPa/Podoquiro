-- Taxa de agendamento (valor padrão por empresa) e links de pagamento Rede QR Code.

alter table public.empresas
  add column if not exists taxa_agendamento_valor numeric(12, 2) not null default 0;

comment on column public.empresas.taxa_agendamento_valor is
  'Valor padrão da taxa de confirmação/reserva de agendamento (R$), usado ao gerar link Rede.';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agendamento_taxa_rede_status') then
    create type public.agendamento_taxa_rede_status as enum (
      'pendente',
      'pago',
      'expirado',
      'cancelado'
    );
  end if;
end $$;

create table if not exists public.agendamento_taxa_rede (
  id bigint generated always as identity primary key,
  id_agendamento bigint not null references public.agendamentos (id) on delete cascade,
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  valor numeric(12, 2) not null,
  status public.agendamento_taxa_rede_status not null default 'pendente',
  rede_tid text null,
  rede_qrcode_base64 text null,
  rede_codigo_pagamento text null,
  rede_resposta jsonb null,
  expira_em timestamptz null,
  pago_em timestamptz null,
  created_at timestamptz not null default now(),
  constraint agendamento_taxa_rede_valor_positivo check (valor > 0),
  constraint agendamento_taxa_rede_token_uq unique (token)
);

create index if not exists agendamento_taxa_rede_id_agendamento_idx
  on public.agendamento_taxa_rede (id_agendamento);

create index if not exists agendamento_taxa_rede_id_empresa_status_idx
  on public.agendamento_taxa_rede (id_empresa, status);

comment on table public.agendamento_taxa_rede is
  'Links de pagamento da taxa de agendamento via API QR Code Rede.';
