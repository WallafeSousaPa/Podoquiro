-- Certificado digital A1 (.pfx) e senha armazenados cifrados (app usa NFE_CERT_MASTER_KEY).
create table if not exists public.empresa_nfe_certificados (
  id uuid primary key default gen_random_uuid(),
  id_empresa bigint not null unique references public.empresas (id) on delete cascade,
  pfx_cifrado bytea not null,
  senha_cifrada text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists empresa_nfe_certificados_id_empresa_idx
  on public.empresa_nfe_certificados (id_empresa);

comment on table public.empresa_nfe_certificados is 'Certificado NF-e por empresa: .pfx e senha em formato cifrado (AES-256-GCM no aplicativo).';

create or replace function public.touch_empresa_nfe_certificados_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists empresa_nfe_certificados_set_updated_at on public.empresa_nfe_certificados;
create trigger empresa_nfe_certificados_set_updated_at
before update on public.empresa_nfe_certificados
for each row
execute function public.touch_empresa_nfe_certificados_updated_at();
