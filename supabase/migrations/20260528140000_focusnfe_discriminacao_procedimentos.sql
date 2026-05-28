-- Remove coluna legada (instalações que rodaram a versão anterior da migration 20260528120000).

alter table public.empresa_focusnfe_config
  drop column if exists discriminacao_padrao;
