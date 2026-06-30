-- Referência da ordem Rede e log de webhooks de pagamento.

alter table public.agendamento_taxa_rede
  add column if not exists rede_referencia text null;

comment on column public.agendamento_taxa_rede.rede_referencia is
  'Referência/order_id enviada à Rede na geração do QR Code (para conciliação via webhook).';

create index if not exists agendamento_taxa_rede_rede_tid_idx
  on public.agendamento_taxa_rede (rede_tid)
  where rede_tid is not null;

create index if not exists agendamento_taxa_rede_rede_referencia_idx
  on public.agendamento_taxa_rede (rede_referencia)
  where rede_referencia is not null;

create table if not exists public.rede_webhook_eventos (
  id bigint generated always as identity primary key,
  id_empresa bigint null references public.empresas (id) on delete set null,
  id_taxa_rede bigint null references public.agendamento_taxa_rede (id) on delete set null,
  rede_tid text null,
  evento text null,
  payload jsonb not null default '{}'::jsonb,
  processado boolean not null default false,
  resultado text null,
  created_at timestamptz not null default now()
);

create index if not exists rede_webhook_eventos_tid_idx
  on public.rede_webhook_eventos (rede_tid);

create index if not exists rede_webhook_eventos_created_idx
  on public.rede_webhook_eventos (created_at desc);

comment on table public.rede_webhook_eventos is
  'Auditoria das notificações webhook recebidas da Rede (Pix / QR Code).';
