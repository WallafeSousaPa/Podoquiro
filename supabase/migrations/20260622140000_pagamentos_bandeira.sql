-- Bandeira do cartão vinculada ao pagamento do agendamento (NFC-e tBand).

alter table public.pagamentos
  add column if not exists id_bandeira bigint null
  references public.bandeiras (id) on delete set null;

create index if not exists pagamentos_id_bandeira_idx
  on public.pagamentos (id_bandeira);

comment on column public.pagamentos.id_bandeira is
  'Bandeira do cartão (tabela bandeiras), obrigatória para formas cartão crédito/débito.';
