-- Retorno pós-atendimento: podóloga sinaliza; recepção agenda curativo e vincula id_retorno.

alter table public.agendamentos
  add column if not exists agendar_retorno boolean not null default false;

alter table public.agendamentos
  add column if not exists id_retorno bigint null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agendamentos_id_retorno_fkey'
  ) then
    alter table public.agendamentos
      add constraint agendamentos_id_retorno_fkey
      foreign key (id_retorno) references public.agendamentos (id) on delete set null;
  end if;
end $$;

create index if not exists agendamentos_id_retorno_idx
  on public.agendamentos (id_retorno)
  where id_retorno is not null;

comment on column public.agendamentos.agendar_retorno is
  'Quando true, a recepção deve agendar retorno (curativo) antes de baixar pagamento no caixa.';

comment on column public.agendamentos.id_retorno is
  'Agendamento de retorno (status curativo_agendado) vinculado a este atendimento.';
