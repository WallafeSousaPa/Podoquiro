-- NFS-e (serviço) via provedor Notaas — controle local + sincronização de status.
create table if not exists public.empresa_notaas_config (
  id uuid primary key default gen_random_uuid(),
  id_empresa bigint not null unique references public.empresas (id) on delete cascade,
  api_key_cifrada text null,
  codigo_servico_padrao text null,
  aliquota_iss_padrao numeric(6, 4) null,
  iss_retido_padrao boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.empresa_notaas_config is
  'Parâmetros Notaas por empresa. API key opcional (cifrada); se vazia, usa NOTAAS_API_KEY do ambiente.';

create index if not exists empresa_notaas_config_id_empresa_idx
  on public.empresa_notaas_config (id_empresa);

create table if not exists public.nfse_emissoes (
  id uuid primary key default gen_random_uuid(),
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  id_paciente bigint null references public.pacientes (id) on delete set null,
  id_produto uuid null references public.produtos (id) on delete set null,

  notaas_invoice_id text null,
  referencia text null,

  status text not null default 'pendente',
  constraint nfse_emissoes_status_chk check (
    status in (
      'pendente',
      'processando',
      'emitida',
      'erro',
      'cancelada',
      'contingencia'
    )
  ),

  numero_nfse text null,
  ch_nfse text null,
  ambiente text null,

  valor_total numeric(14, 2) not null,
  aliquota_iss numeric(6, 4) not null,
  iss_retido boolean not null default false,
  descricao_servico text not null,
  codigo_servico text null,

  tomador_nome text not null,
  tomador_documento text not null,
  tomador_email text null,

  error_code text null,
  error_message text null,
  pdf_url text null,
  xml_url text null,

  payload_envio jsonb null,
  payload_status jsonb null,

  emitted_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nfse_emissoes_id_empresa_idx on public.nfse_emissoes (id_empresa);
create index if not exists nfse_emissoes_status_idx on public.nfse_emissoes (status);
create index if not exists nfse_emissoes_notaas_invoice_idx on public.nfse_emissoes (notaas_invoice_id);
create index if not exists nfse_emissoes_referencia_idx on public.nfse_emissoes (referencia);

comment on table public.nfse_emissoes is
  'NFS-e de serviço emitida via Notaas; status sincronizado por polling ou webhook.';

create or replace function public.touch_empresa_notaas_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists empresa_notaas_config_set_updated_at on public.empresa_notaas_config;
create trigger empresa_notaas_config_set_updated_at
before update on public.empresa_notaas_config
for each row
execute function public.touch_empresa_notaas_config_updated_at();

create or replace function public.touch_nfse_emissoes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists nfse_emissoes_set_updated_at on public.nfse_emissoes;
create trigger nfse_emissoes_set_updated_at
before update on public.nfse_emissoes
for each row
execute function public.touch_nfse_emissoes_updated_at();
