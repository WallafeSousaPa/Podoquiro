-- Prontuário por atendimento (evolução + fotos no bucket Prontuario).

create table if not exists public.prontuario_paciente (
  id bigint generated always as identity primary key,
  id_agendamento bigint not null references public.agendamentos (id) on delete cascade,
  evolucao text not null default '',
  fotos jsonb not null default '[]'::jsonb,
  procedimentos_realizados jsonb not null default '[]'::jsonb,
  data_registro timestamptz not null default now(),
  constraint prontuario_paciente_id_agendamento_uq unique (id_agendamento),
  constraint prontuario_fotos_array check (jsonb_typeof(fotos) = 'array'),
  constraint prontuario_proc_array check (jsonb_typeof(procedimentos_realizados) = 'array')
);

create index if not exists prontuario_paciente_id_agendamento_idx
  on public.prontuario_paciente (id_agendamento);

comment on table public.prontuario_paciente is
  'Evolução e fotos do atendimento; fotos = JSON array de caminhos no bucket Prontuario.';

comment on column public.prontuario_paciente.fotos is
  'Array JSON de strings: caminho relativo no bucket (ex.: "1/JoaoSilva_12_0.jpg").';

comment on column public.prontuario_paciente.procedimentos_realizados is
  'Array JSON de ids de procedimentos (bigint) efetivamente realizados neste atendimento.';

-- Bucket privado para imagens do prontuário (upload via API com service role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'Prontuario',
  'Prontuario',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']::text[]
)
on conflict (id) do update
set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
