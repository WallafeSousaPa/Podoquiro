-- Status de agendamento: curativo agendado (cor do card = empresas.agenda_cor_corte_tecnico).

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    join pg_namespace n on t.typnamespace = n.oid
    where n.nspname = 'public'
      and t.typname = 'agendamento_status'
      and e.enumlabel = 'curativo_agendado'
  ) then
    alter type public.agendamento_status add value 'curativo_agendado' after 'adiado';
  end if;
end $$;
