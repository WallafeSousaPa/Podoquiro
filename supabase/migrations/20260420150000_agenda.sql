-- Agenda: agendamentos, procedimentos do agendamento, pagamentos e grupos exibidos no calendário.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agendamento_status') then
    create type public.agendamento_status as enum (
      'pendente',
      'em_andamento',
      'realizado',
      'cancelado',
      'adiado'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'pagamento_status') then
    create type public.pagamento_status as enum (
      'pago',
      'estornado',
      'pendente'
    );
  end if;
end
$$;

-- Quais grupos de usuário aparecem como colunas no calendário (por empresa).
create table if not exists public.empresa_agenda_grupos (
  id bigint generated always as identity primary key,
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  id_grupo_usuarios bigint not null references public.usuarios_grupos (id) on delete cascade,
  constraint empresa_agenda_grupos_empresa_grupo_uq unique (id_empresa, id_grupo_usuarios)
);

create index if not exists empresa_agenda_grupos_id_empresa_idx
  on public.empresa_agenda_grupos (id_empresa);

comment on table public.empresa_agenda_grupos is
  'Grupos de usuário cujos profissionais aparecem no calendário. Se vazio, usa o grupo Podólogo (nome contém podolog).';

create table if not exists public.agendamentos (
  id bigint generated always as identity primary key,
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  id_usuario bigint not null references public.usuarios (id) on delete restrict,
  id_paciente bigint not null references public.pacientes (id) on delete restrict,
  id_sala bigint not null references public.salas (id) on delete restrict,
  data_hora_inicio timestamptz not null,
  data_hora_fim timestamptz not null,
  status public.agendamento_status not null default 'pendente',
  valor_bruto numeric(14, 2) not null default 0,
  desconto numeric(9, 4) not null default 0,
  valor_total numeric(14, 2) not null default 0,
  observacoes text null,
  constraint agendamentos_fim_apos_inicio check (data_hora_fim > data_hora_inicio),
  constraint agendamentos_desconto_pct check (desconto >= 0 and desconto <= 100),
  constraint agendamentos_valores_nao_negativos check (valor_bruto >= 0 and valor_total >= 0)
);

create index if not exists agendamentos_id_empresa_inicio_idx
  on public.agendamentos (id_empresa, data_hora_inicio);

create index if not exists agendamentos_id_usuario_inicio_idx
  on public.agendamentos (id_usuario, data_hora_inicio);

comment on table public.agendamentos is 'Agendamentos de atendimento por profissional, paciente e sala.';

create table if not exists public.agendamento_procedimentos (
  id bigint generated always as identity primary key,
  id_agendamento bigint not null references public.agendamentos (id) on delete cascade,
  id_procedimento bigint not null references public.procedimentos (id) on delete restrict,
  valor_aplicado numeric(14, 2) not null,
  constraint agendamento_procedimentos_ag_proc_uq unique (id_agendamento, id_procedimento),
  constraint agendamento_procedimentos_valor_nao_negativo check (valor_aplicado >= 0)
);

create index if not exists agendamento_procedimentos_id_agendamento_idx
  on public.agendamento_procedimentos (id_agendamento);

comment on table public.agendamento_procedimentos is 'Procedimentos vinculados ao agendamento com valor aplicado (snapshot).';

create table if not exists public.pagamentos (
  id bigint generated always as identity primary key,
  id_agendamento bigint not null references public.agendamentos (id) on delete cascade,
  id_forma_pagamento bigint not null references public.formas_pagamento (id) on delete restrict,
  id_maquineta bigint null references public.maquinetas (id) on delete set null,
  valor_pago numeric(14, 2) not null,
  status_pagamento public.pagamento_status not null default 'pendente',
  constraint pagamentos_valor_nao_negativo check (valor_pago >= 0)
);

create index if not exists pagamentos_id_agendamento_idx
  on public.pagamentos (id_agendamento);

comment on table public.pagamentos is 'Pagamentos do agendamento (vários por atendimento, ex.: Pix + cartão).';
