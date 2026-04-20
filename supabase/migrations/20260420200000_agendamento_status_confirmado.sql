-- Novo status: confirmado (entre agendado e em atendimento).

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    join pg_namespace n on t.typnamespace = n.oid
    where n.nspname = 'public'
      and t.typname = 'agendamento_status'
      and e.enumlabel = 'confirmado'
  ) then
    alter type public.agendamento_status add value 'confirmado' after 'pendente';
  end if;
end $$;
