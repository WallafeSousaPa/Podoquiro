-- Marca permanente: o agendamento já foi "Curativo agendado".
-- A cor do card deve permanecer a de "Curativo agendado" mesmo após troca de status
-- (exceto quando o status atual for cancelado/faltou — tratado na aplicação).

alter table public.agendamentos
  add column if not exists foi_curativo_agendado boolean not null default false;

-- Backfill: agendamentos que estão (ou estiveram, até onde dá para saber) como curativo agendado.
update public.agendamentos
  set foi_curativo_agendado = true
  where status = 'curativo_agendado'
    and foi_curativo_agendado = false;

comment on column public.agendamentos.foi_curativo_agendado is
  'Quando true, o card mantém a cor de Curativo agendado mesmo que o status mude depois (exceto cancelado/faltou).';
