-- CNAE padrão (Belém/DSF exige atividade vinculada ao item LC 116).
alter table public.empresa_notaas_config
  add column if not exists cnae_padrao text null;

comment on column public.empresa_notaas_config.cnae_padrao is
  'CNAE 9 dígitos (ex.: 960250100 para 6.01 em Belém). Obrigatório em municípios DSF/GINFES.';
