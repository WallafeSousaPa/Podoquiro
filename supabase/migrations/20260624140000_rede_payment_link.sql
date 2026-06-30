-- Link de Pagamento Rede (paymentLinkId + URL checkout).

alter table public.agendamento_taxa_rede
  add column if not exists rede_payment_link_id text null,
  add column if not exists rede_payment_link_url text null;

create index if not exists agendamento_taxa_rede_payment_link_id_idx
  on public.agendamento_taxa_rede (rede_payment_link_id)
  where rede_payment_link_id is not null;

comment on column public.agendamento_taxa_rede.rede_payment_link_id is
  'Identificador do link na API Link de Pagamento Rede (paymentLinkId).';

comment on column public.agendamento_taxa_rede.rede_payment_link_url is
  'URL pública do checkout Rede para o paciente pagar.';
