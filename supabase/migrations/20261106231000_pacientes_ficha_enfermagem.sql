-- Ficha de admissão, avaliação e pé diabético preenchida pela enfermagem no atendimento.

create table if not exists public.pacientes_ficha_enfermagem (
  id bigint generated always as identity primary key,
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  id_paciente bigint not null references public.pacientes (id) on delete cascade,
  id_agendamento bigint not null references public.agendamentos (id) on delete cascade,
  id_usuario bigint not null references public.usuarios (id) on delete restrict,
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pacientes_ficha_enfermagem_dados_objeto check (jsonb_typeof(dados) = 'object'),
  constraint pacientes_ficha_enfermagem_agendamento_uq unique (id_agendamento)
);

create index if not exists pacientes_ficha_enfermagem_paciente_idx
  on public.pacientes_ficha_enfermagem (id_paciente, updated_at desc);

create index if not exists pacientes_ficha_enfermagem_empresa_idx
  on public.pacientes_ficha_enfermagem (id_empresa, id_agendamento);

comment on table public.pacientes_ficha_enfermagem is
  'Ficha de admissão, avaliação e pé diabético da enfermagem, uma por agendamento.';

alter table public.pacientes_ficha_enfermagem enable row level security;
