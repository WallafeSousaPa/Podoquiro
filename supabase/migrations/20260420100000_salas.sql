-- Salas de atendimento por empresa (clínica).
create table if not exists public.salas (
  id bigint generated always as identity primary key,
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  nome_sala text not null,
  ativo boolean not null default true,
  ultima_atualizacao timestamptz not null default now(),
  constraint salas_nome_nao_vazio check (btrim(nome_sala) <> '')
);

create index if not exists salas_id_empresa_idx on public.salas (id_empresa);

comment on table public.salas is 'Salas/consultórios da empresa.';

create or replace function public.touch_salas_ultima_atualizacao()
returns trigger
language plpgsql
as $$
begin
  new.ultima_atualizacao := now();
  return new;
end;
$$;

drop trigger if exists salas_set_ultima_atualizacao on public.salas;
create trigger salas_set_ultima_atualizacao
before update on public.salas
for each row
execute function public.touch_salas_ultima_atualizacao();
