-- Contrato particular de prestação de serviços de enfermagem.
-- Vários por paciente. A fila avisa quando já existe e pergunta se deseja outro.

create table if not exists public.pacientes_contratos_enfermagem (
  id bigint generated always as identity primary key,
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  id_paciente bigint not null references public.pacientes (id) on delete cascade,
  id_agendamento bigint null references public.agendamentos (id) on delete set null,
  id_usuario bigint not null references public.usuarios (id) on delete restrict,
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pacientes_contratos_enfermagem_dados_objeto check (jsonb_typeof(dados) = 'object')
);

create index if not exists pacientes_contratos_enfermagem_paciente_idx
  on public.pacientes_contratos_enfermagem (id_empresa, id_paciente, created_at desc);

create index if not exists pacientes_contratos_enfermagem_empresa_idx
  on public.pacientes_contratos_enfermagem (id_empresa, created_at desc);

comment on table public.pacientes_contratos_enfermagem is
  'Contrato particular de prestação de serviços de enfermagem, por paciente.';

alter table public.pacientes_contratos_enfermagem enable row level security;

-- Pacientes > Contratos para Enfermagem, Administrador e Diretoria.
insert into public.menu_permissoes_grupo (id_grupo, menu_chave)
select g.id, 'pacientes.contratos'
from public.usuarios_grupos g
where translate(lower(btrim(g.grupo_usuarios)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
  ~ '(enfermagem|enfermeir|administrador|^admin$|diretoria|^diretor$)'
on conflict (id_grupo, menu_chave) do nothing;

insert into public.menu_permissoes_usuario (id_usuario, menu_chave)
select distinct u.id, 'pacientes.contratos'
from public.usuarios u
join public.usuarios_grupos g on g.id = u.id_grupo_usuarios
where exists (
  select 1 from public.menu_permissoes_usuario p where p.id_usuario = u.id
)
and translate(lower(btrim(g.grupo_usuarios)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
  ~ '(enfermagem|enfermeir|administrador|^admin$|diretoria|^diretor$)'
on conflict (id_usuario, menu_chave) do nothing;
