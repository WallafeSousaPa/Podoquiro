-- Permite incluir o mesmo procedimento mais de uma vez no mesmo agendamento.

alter table public.agendamento_procedimentos
  drop constraint if exists agendamento_procedimentos_ag_proc_uq;

comment on table public.agendamento_procedimentos is
  'Procedimentos vinculados ao agendamento com valor aplicado (snapshot). O mesmo procedimento pode aparecer em mais de uma linha.';
