-- Condição de saúde, tipo de unha e hidrose passam a ser múltipla escolha (N:N).

create table if not exists public.pacientes_evolucao_condicoes (
  id_pacientes_evolucao bigint not null references public.pacientes_evolucao (id) on delete cascade,
  id_condicao bigint not null references public.condicoes_saude (id) on delete cascade,
  primary key (id_pacientes_evolucao, id_condicao)
);

create table if not exists public.pacientes_evolucao_tipos_unha (
  id_pacientes_evolucao bigint not null references public.pacientes_evolucao (id) on delete cascade,
  id_tipo_unha bigint not null references public.tipos_unhas (id) on delete cascade,
  primary key (id_pacientes_evolucao, id_tipo_unha)
);

create table if not exists public.pacientes_evolucao_hidroses (
  id_pacientes_evolucao bigint not null references public.pacientes_evolucao (id) on delete cascade,
  id_hidrose bigint not null references public.hidroses (id) on delete cascade,
  primary key (id_pacientes_evolucao, id_hidrose)
);

create index if not exists pacientes_evolucao_condicoes_condicao_idx
  on public.pacientes_evolucao_condicoes (id_condicao);

create index if not exists pacientes_evolucao_tipos_unha_unha_idx
  on public.pacientes_evolucao_tipos_unha (id_tipo_unha);

create index if not exists pacientes_evolucao_hidroses_hidrose_idx
  on public.pacientes_evolucao_hidroses (id_hidrose);

insert into public.pacientes_evolucao_condicoes (id_pacientes_evolucao, id_condicao)
select id, id_condicao
from public.pacientes_evolucao
where id_condicao is not null
on conflict (id_pacientes_evolucao, id_condicao) do nothing;

insert into public.pacientes_evolucao_tipos_unha (id_pacientes_evolucao, id_tipo_unha)
select id, id_tipo_unha
from public.pacientes_evolucao
where id_tipo_unha is not null
on conflict (id_pacientes_evolucao, id_tipo_unha) do nothing;

insert into public.pacientes_evolucao_hidroses (id_pacientes_evolucao, id_hidrose)
select id, id_hidrose
from public.pacientes_evolucao
where id_hidrose is not null
on conflict (id_pacientes_evolucao, id_hidrose) do nothing;

alter table public.pacientes_evolucao drop column if exists id_condicao;
alter table public.pacientes_evolucao drop column if exists id_tipo_unha;
alter table public.pacientes_evolucao drop column if exists id_hidrose;

comment on table public.pacientes_evolucao_condicoes is 'Vínculo N:N entre evolução/anamnese e condições de saúde.';
comment on table public.pacientes_evolucao_tipos_unha is 'Vínculo N:N entre evolução/anamnese e tipos de unha.';
comment on table public.pacientes_evolucao_hidroses is 'Vínculo N:N entre evolução/anamnese e hidroses.';
