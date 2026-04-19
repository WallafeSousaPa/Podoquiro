alter table public.usuarios
  add column if not exists nome_completo text null;

alter table public.usuarios
  add column if not exists cpf text null;

comment on column public.usuarios.nome_completo is 'Nome completo do usuário.';
comment on column public.usuarios.cpf is 'CPF (somente dígitos).';

create unique index if not exists usuarios_id_empresa_cpf_unique
  on public.usuarios (id_empresa, cpf)
  where cpf is not null and btrim(cpf) <> '';
