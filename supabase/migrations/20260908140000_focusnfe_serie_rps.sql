-- Série da DPS/RPS na faixa da NFS-e nacional via API (L0022 em Belém: 10001–49999).

alter table public.empresa_focusnfe_config
  add column if not exists serie_rps text not null default '10001';

comment on column public.empresa_focusnfe_config.serie_rps is
  'Série da DPS/RPS. Em Belém (NFS-e nacional) deve estar entre 10001 e 49999.';
