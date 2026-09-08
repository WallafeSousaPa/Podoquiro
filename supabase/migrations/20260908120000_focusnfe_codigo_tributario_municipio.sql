-- Código de tributação municipal (cTribMun) exigido pela NFS-e nacional em Belém (L0017).

alter table public.empresa_focusnfe_config
  add column if not exists codigo_tributario_municipio text not null default '001';

comment on column public.empresa_focusnfe_config.codigo_tributario_municipio is
  'Desdobro municipal (cTribMun), em geral 3 dígitos. Obrigatório na NFS-e nacional de Belém.';
