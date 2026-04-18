-- Importação Excel: CPF e telefone opcionais; unicidade de CPF e nome por empresa quando preenchidos.
alter table public.pacientes drop constraint if exists pacientes_id_empresa_cpf_unique;

alter table public.pacientes alter column cpf drop not null;
alter table public.pacientes alter column telefone drop not null;

create unique index if not exists pacientes_id_empresa_cpf_partial_idx
  on public.pacientes (id_empresa, cpf)
  where cpf is not null and trim(cpf) <> '';

create unique index if not exists pacientes_id_empresa_nome_completo_idx
  on public.pacientes (id_empresa, lower(trim(nome_completo)))
  where nome_completo is not null and trim(nome_completo) <> '';
