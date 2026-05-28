-- NFS-e via Focus NFe (emissão a partir de atendimentos quitados).

create table if not exists public.empresa_focusnfe_config (
  id_empresa bigint primary key references public.empresas (id) on delete cascade,
  token_cifrado text null,
  ambiente text not null default 'homologacao'
    constraint empresa_focusnfe_config_ambiente_chk
    check (ambiente in ('homologacao', 'producao')),
  prestador_cnpj text not null default '',
  prestador_inscricao_municipal text not null default '',
  prestador_codigo_municipio text not null default '1501402',
  item_lista_servico text not null default '060101',
  codigo_cnae text not null default '869090400',
  natureza_operacao text not null default '1',
  regime_especial_tributacao text null default '6',
  optante_simples_nacional boolean not null default true,
  iss_retido_padrao boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.empresa_focusnfe_config is
  'Token Focus NFe (cifrado), ambiente e dados do prestador/serviço para NFS-e.';

create index if not exists empresa_focusnfe_config_id_empresa_idx
  on public.empresa_focusnfe_config (id_empresa);

create table if not exists public.nfse_focus_emissoes (
  id uuid primary key default gen_random_uuid(),
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  id_agendamento bigint not null references public.agendamentos (id) on delete restrict,
  id_paciente bigint not null references public.pacientes (id) on delete restrict,
  focus_ref text not null,
  status text not null default 'processando_autorizacao',
  numero_rps text null,
  serie_rps text null,
  tipo_rps text null,
  numero_nfse text null,
  codigo_verificacao text null,
  valor_servicos numeric(12, 2) not null,
  discriminacao text not null,
  url_danfse text null,
  caminho_xml_nota_fiscal text null,
  payload_envio jsonb null,
  payload_resposta jsonb null,
  error_message text null,
  emitted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nfse_focus_emissoes_ref_uq unique (id_empresa, focus_ref)
);

create index if not exists nfse_focus_emissoes_id_empresa_idx
  on public.nfse_focus_emissoes (id_empresa);
create index if not exists nfse_focus_emissoes_id_agendamento_idx
  on public.nfse_focus_emissoes (id_agendamento);
create index if not exists nfse_focus_emissoes_status_idx
  on public.nfse_focus_emissoes (status);

comment on table public.nfse_focus_emissoes is
  'Histórico de NFS-e emitidas via Focus NFe por agendamento.';

comment on column public.nfse_focus_emissoes.discriminacao is
  'Procedimentos realizados no atendimento (campo servico.discriminacao enviado à Focus NFe).';

create or replace function public.touch_empresa_focusnfe_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists empresa_focusnfe_config_set_updated_at on public.empresa_focusnfe_config;
create trigger empresa_focusnfe_config_set_updated_at
before update on public.empresa_focusnfe_config
for each row
execute function public.touch_empresa_focusnfe_config_updated_at();

create or replace function public.touch_nfse_focus_emissoes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists nfse_focus_emissoes_set_updated_at on public.nfse_focus_emissoes;
create trigger nfse_focus_emissoes_set_updated_at
before update on public.nfse_focus_emissoes
for each row
execute function public.touch_nfse_focus_emissoes_updated_at();
