-- Expediente do colaborador (profissional): janela de trabalho, intervalo (almoço) e bloqueio.
-- Usado no relatório "Intervalos vagos" para calcular o tempo ocioso entre agendamentos.

create table if not exists public.colaboradores_expedientes (
  id bigint generated always as identity primary key,
  id_usuario bigint not null,
  horario_inicio time not null,
  intervalo_inicio time null,
  intervalo_fim time null,
  horario_fim time not null,
  horario_inicio_bloqueado time null,
  horario_fim_bloqueado time null,
  constraint colaboradores_expedientes_id_usuario_fkey
    foreign key (id_usuario) references public.usuarios (id) on delete cascade,
  constraint colaboradores_expedientes_id_usuario_unique unique (id_usuario)
);

comment on table public.colaboradores_expedientes is
  'Expediente do profissional (janela de trabalho, intervalo e bloqueio) para cálculo de intervalos vagos.';
comment on column public.colaboradores_expedientes.horario_inicio is 'Início do expediente (hh:mm).';
comment on column public.colaboradores_expedientes.horario_fim is 'Fim do expediente (hh:mm).';
comment on column public.colaboradores_expedientes.intervalo_inicio is 'Início do intervalo/almoço (hh:mm).';
comment on column public.colaboradores_expedientes.intervalo_fim is 'Fim do intervalo/almoço (hh:mm).';
comment on column public.colaboradores_expedientes.horario_inicio_bloqueado is 'Início de um período bloqueado (hh:mm).';
comment on column public.colaboradores_expedientes.horario_fim_bloqueado is 'Fim de um período bloqueado (hh:mm).';
