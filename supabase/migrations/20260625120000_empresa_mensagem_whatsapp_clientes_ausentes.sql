alter table public.empresas
  add column if not exists mensagem_whatsapp_clientes_ausentes text not null default '';

comment on column public.empresas.mensagem_whatsapp_clientes_ausentes is
  'Mensagem personalizada para WhatsApp no relatório Clientes ausentes. Use {nome} para inserir o nome do paciente no corpo.';
