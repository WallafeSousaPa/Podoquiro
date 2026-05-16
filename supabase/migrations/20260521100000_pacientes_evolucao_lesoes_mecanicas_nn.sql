-- Lesões mecânicas: de FK única para vínculo N:N (múltipla escolha), alinhado a hidroses.

create table if not exists public.pacientes_evolucao_lesoes_mecanicas (
  id_pacientes_evolucao bigint not null references public.pacientes_evolucao (id) on delete cascade,
  id_lesoes_mecanicas bigint not null references public.lesoes_mecanicas (id) on delete cascade,
  primary key (id_pacientes_evolucao, id_lesoes_mecanicas)
);

create index if not exists pacientes_evolucao_lesoes_mecanicas_lesao_idx
  on public.pacientes_evolucao_lesoes_mecanicas (id_lesoes_mecanicas);

insert into public.pacientes_evolucao_lesoes_mecanicas (id_pacientes_evolucao, id_lesoes_mecanicas)
select id, id_lesoes_mecanicas
from public.pacientes_evolucao
where id_lesoes_mecanicas is not null
on conflict (id_pacientes_evolucao, id_lesoes_mecanicas) do nothing;

alter table public.pacientes_evolucao drop column if exists id_lesoes_mecanicas;

comment on table public.pacientes_evolucao_lesoes_mecanicas is 'Vínculo N:N entre evolução/anamnese e lesões mecânicas.';
