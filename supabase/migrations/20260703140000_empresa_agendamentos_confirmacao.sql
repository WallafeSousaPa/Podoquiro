alter table public.empresas
  add column if not exists agendamentos_confirmacao boolean not null default false;

comment on column public.empresas.agendamentos_confirmacao is
  'Quando true, confirmação manual só com taxa em dinheiro; demais confirmações via link de pagamento pago.';

alter table public.agendamento_taxa_rede
  add column if not exists pago_em_dinheiro boolean not null default false;

comment on column public.agendamento_taxa_rede.pago_em_dinheiro is
  'Taxa quitada em dinheiro no balcão (confirmação manual).';
