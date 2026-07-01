-- Link de Pagamento Asaas (substitui a integração Rede, temporariamente inativa).
-- Colunas próprias para não conflitar com registros antigos da Rede.

alter table public.agendamento_taxa_rede
  add column if not exists asaas_payment_link_id text null,
  add column if not exists asaas_payment_id text null,
  add column if not exists asaas_payment_link_url text null,
  add column if not exists asaas_resposta jsonb null;

create index if not exists agendamento_taxa_rede_asaas_payment_link_id_idx
  on public.agendamento_taxa_rede (asaas_payment_link_id)
  where asaas_payment_link_id is not null;

comment on column public.agendamento_taxa_rede.asaas_payment_link_id is
  'Identificador do link na API de Link de Pagamento Asaas (paymentLink id).';

comment on column public.agendamento_taxa_rede.asaas_payment_id is
  'Identificador da cobrança Asaas gerada ao pagar o link (payment id).';

comment on column public.agendamento_taxa_rede.asaas_payment_link_url is
  'URL pública do checkout Asaas para o paciente pagar.';
