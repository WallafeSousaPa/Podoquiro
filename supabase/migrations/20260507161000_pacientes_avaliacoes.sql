-- Pacientes > Avaliações: tabelas auxiliares, evolução e bucket público de imagens.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'forma_contato_paciente'
  ) then
    create type public.forma_contato_paciente as enum (
      'Instagram',
      'Google',
      'Tik Tok',
      'Facebook',
      'Indicação'
    );
  end if;
end $$;

create table if not exists public.condicoes_saude (
  id bigint generated always as identity primary key,
  condicao text not null,
  ativo boolean not null default true,
  data timestamptz not null default now()
);

create table if not exists public.tipos_unhas (
  id bigint generated always as identity primary key,
  tipo text not null,
  ativo boolean not null default true,
  data timestamptz not null default now()
);

create table if not exists public.tipo_pe (
  id bigint generated always as identity primary key,
  tipo text not null,
  ativo boolean not null default true,
  data timestamptz not null default now()
);

create table if not exists public.hidroses (
  id bigint generated always as identity primary key,
  tipo text not null,
  ativo boolean not null default true,
  data timestamptz not null default now()
);

create table if not exists public.lesoes_mecanicas (
  id bigint generated always as identity primary key,
  tipo text not null,
  ativo boolean not null default true,
  data timestamptz not null default now()
);

create table if not exists public.formato_dedos (
  id bigint generated always as identity primary key,
  tipo text not null,
  ativo boolean not null default true,
  data timestamptz not null default now()
);

create table if not exists public.formato_pe (
  id bigint generated always as identity primary key,
  tipo text not null,
  ativo boolean not null default true,
  data timestamptz not null default now()
);

create table if not exists public.pacientes_evolucao (
  id bigint generated always as identity primary key,
  id_paciente bigint not null references public.pacientes (id) on delete cascade,
  id_responsavel bigint not null references public.usuarios (id) on delete restrict,
  id_condicao bigint null references public.condicoes_saude (id) on delete set null,
  pressao_arterial text null,
  glicemia text null,
  atividade_fisica text null,
  tipo_calcado text null,
  alergias text null,
  id_tipo_unha bigint null references public.tipos_unhas (id) on delete set null,
  id_pe_esquerdo bigint null references public.tipo_pe (id) on delete set null,
  id_pe_direito bigint null references public.tipo_pe (id) on delete set null,
  id_hidrose bigint null references public.hidroses (id) on delete set null,
  id_lesoes_mecanicas bigint null references public.lesoes_mecanicas (id) on delete set null,
  digito_pressao text null,
  varizes text null,
  claudicacao text null,
  temperatura text null,
  oleo text null,
  agua text null,
  observacao text null,
  id_formato_dedos bigint null references public.formato_dedos (id) on delete set null,
  id_formato_pe bigint null references public.formato_pe (id) on delete set null,
  forma_contato public.forma_contato_paciente null,
  tratamento_sugerido text null,
  foto_plantar_direito text null,
  foto_plantar_esquerdo text null,
  foto_dorso_direito text null,
  foto_dorso_esquerdo text null,
  foto_doc_termo_consentimento text null,
  ativo boolean not null default true,
  data timestamptz not null default now()
);

create index if not exists condicoes_saude_ativo_idx on public.condicoes_saude (ativo, data desc);
create index if not exists tipos_unhas_ativo_idx on public.tipos_unhas (ativo, data desc);
create index if not exists tipo_pe_ativo_idx on public.tipo_pe (ativo, data desc);
create index if not exists hidroses_ativo_idx on public.hidroses (ativo, data desc);
create index if not exists lesoes_mecanicas_ativo_idx on public.lesoes_mecanicas (ativo, data desc);
create index if not exists formato_dedos_ativo_idx on public.formato_dedos (ativo, data desc);
create index if not exists formato_pe_ativo_idx on public.formato_pe (ativo, data desc);

create index if not exists pacientes_evolucao_id_paciente_idx
  on public.pacientes_evolucao (id_paciente, data desc);
create index if not exists pacientes_evolucao_id_responsavel_idx
  on public.pacientes_evolucao (id_responsavel, data desc);
create index if not exists pacientes_evolucao_ativo_idx
  on public.pacientes_evolucao (ativo, data desc);

create or replace function public.atualizar_coluna_data_generica()
returns trigger
language plpgsql
as $$
begin
  new.data = now();
  return new;
end;
$$;

drop trigger if exists condicoes_saude_set_data on public.condicoes_saude;
create trigger condicoes_saude_set_data
before update on public.condicoes_saude
for each row execute function public.atualizar_coluna_data_generica();

drop trigger if exists tipos_unhas_set_data on public.tipos_unhas;
create trigger tipos_unhas_set_data
before update on public.tipos_unhas
for each row execute function public.atualizar_coluna_data_generica();

drop trigger if exists tipo_pe_set_data on public.tipo_pe;
create trigger tipo_pe_set_data
before update on public.tipo_pe
for each row execute function public.atualizar_coluna_data_generica();

drop trigger if exists hidroses_set_data on public.hidroses;
create trigger hidroses_set_data
before update on public.hidroses
for each row execute function public.atualizar_coluna_data_generica();

drop trigger if exists lesoes_mecanicas_set_data on public.lesoes_mecanicas;
create trigger lesoes_mecanicas_set_data
before update on public.lesoes_mecanicas
for each row execute function public.atualizar_coluna_data_generica();

drop trigger if exists formato_dedos_set_data on public.formato_dedos;
create trigger formato_dedos_set_data
before update on public.formato_dedos
for each row execute function public.atualizar_coluna_data_generica();

drop trigger if exists formato_pe_set_data on public.formato_pe;
create trigger formato_pe_set_data
before update on public.formato_pe
for each row execute function public.atualizar_coluna_data_generica();

drop trigger if exists pacientes_evolucao_set_data on public.pacientes_evolucao;
create trigger pacientes_evolucao_set_data
before update on public.pacientes_evolucao
for each row execute function public.atualizar_coluna_data_generica();

comment on table public.condicoes_saude is 'Cadastro auxiliar global de condições de saúde para avaliações.';
comment on table public.tipos_unhas is 'Cadastro auxiliar global de tipos de unhas.';
comment on table public.tipo_pe is 'Cadastro auxiliar global para tipagem do pé (esquerdo/direito).';
comment on table public.hidroses is 'Cadastro auxiliar global de hidroses.';
comment on table public.lesoes_mecanicas is 'Cadastro auxiliar global de lesões mecânicas.';
comment on table public.formato_dedos is 'Cadastro auxiliar global de formato dos dedos.';
comment on table public.formato_pe is 'Cadastro auxiliar global de formato do pé.';
comment on table public.pacientes_evolucao is 'Registro de evolução/avaliação do paciente com dados clínicos e fotos.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evolucao_analise',
  'evolucao_analise',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
