alter table public.usuarios
  add column if not exists assinatura text null;

comment on column public.usuarios.assinatura is
  'Assinatura do profissional em data URL JPEG. Copiada para o contrato de enfermagem no momento do salvamento.';
