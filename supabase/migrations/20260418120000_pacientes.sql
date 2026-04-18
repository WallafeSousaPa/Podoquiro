-- Pacientes por empresa; CPF único dentro da mesma empresa.
create table if not exists public.pacientes (
  id bigint generated always as identity primary key,
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  cpf text not null,
  nome_completo text null,
  nome_social text null,
  genero text null,
  data_nascimento date null,
  estado_civil text null,
  email text null,
  telefone text not null,
  cep text null,
  logradouro text null,
  numero text null,
  complemento text null,
  bairro text null,
  cidade text null,
  uf text null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pacientes_id_empresa_cpf_unique unique (id_empresa, cpf),
  constraint pacientes_nome_preenchido check (
    (nome_completo is not null and btrim(nome_completo) <> '')
    or (nome_social is not null and btrim(nome_social) <> '')
  )
);

create index if not exists pacientes_id_empresa_idx on public.pacientes (id_empresa);

comment on table public.pacientes is 'Pacientes atendidos pela empresa (clínica).';
