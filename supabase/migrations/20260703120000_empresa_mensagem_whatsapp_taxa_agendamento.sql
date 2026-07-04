alter table public.empresas
  add column if not exists mensagem_whatsapp_taxa_agendamento text not null default '';

comment on column public.empresas.mensagem_whatsapp_taxa_agendamento is
  'Mensagem WhatsApp ao enviar link de pagamento da taxa de agendamento. Use {nome} e {link}.';
