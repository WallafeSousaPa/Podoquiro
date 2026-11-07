alter table public.pacientes_ficha_enfermagem
  add column if not exists arquivo_termo_assinatura_virtual text null;

comment on column public.pacientes_ficha_enfermagem.arquivo_termo_assinatura_virtual is
  'Caminho no bucket termo_assinatura_virtual do PDF do termo de consentimento com assinatura virtual.';
