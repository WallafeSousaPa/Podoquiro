-- Permissão de menus laterais por tipo de usuário (grupo) e por usuário.
-- Usuário com linhas em menu_permissoes_usuario deixa de herdar o grupo (personalização).

create table if not exists public.menu_permissoes_grupo (
  id_grupo bigint not null references public.usuarios_grupos (id) on delete cascade,
  menu_chave text not null,
  created_at timestamptz not null default now(),
  primary key (id_grupo, menu_chave)
);

create index if not exists menu_permissoes_grupo_chave_idx
  on public.menu_permissoes_grupo (menu_chave);

comment on table public.menu_permissoes_grupo is
  'Menus laterais liberados para um tipo de usuário (usuarios_grupos).';

create table if not exists public.menu_permissoes_usuario (
  id_usuario bigint not null references public.usuarios (id) on delete cascade,
  menu_chave text not null,
  created_at timestamptz not null default now(),
  primary key (id_usuario, menu_chave)
);

create index if not exists menu_permissoes_usuario_chave_idx
  on public.menu_permissoes_usuario (menu_chave);

comment on table public.menu_permissoes_usuario is
  'Personalização de menus de um usuário. Se houver qualquer linha, o usuário não herda o grupo.';

alter table public.menu_permissoes_grupo enable row level security;
alter table public.menu_permissoes_usuario enable row level security;

-- Seed: Administrativo vê tudo (inclui a tela Menus).
insert into public.menu_permissoes_grupo (id_grupo, menu_chave)
select g.id, m.menu_chave
from public.usuarios_grupos g
cross join (
  values
    ('inicio'),
    ('atendimentos.agendamentos'),
    ('atendimentos.atendimento'),
    ('usuarios.cadastro'),
    ('usuarios.grupos'),
    ('usuarios.colaboradores'),
    ('usuarios.menus'),
    ('pacientes.cadastro'),
    ('pacientes.avaliacoes'),
    ('procedimentos.cadastro'),
    ('estoque.cadastro'),
    ('estoque.importacao'),
    ('estoque.saidas'),
    ('ponto'),
    ('nota-fiscal.emissao'),
    ('nota-fiscal.consultar'),
    ('nota-fiscal.nfce'),
    ('financeiro.caixa'),
    ('financeiro.caixa-movimento'),
    ('financeiro.parametrizacao.maquinetas'),
    ('financeiro.parametrizacao.bandeiras'),
    ('financeiro.parametrizacao.tipos-pagamento'),
    ('relatorios.caixa'),
    ('relatorios.atendimentos'),
    ('relatorios.clientes-ausentes'),
    ('relatorios.intervalos-vagos'),
    ('relatorios.comparativo'),
    ('relatorios.links-pagos'),
    ('empresas.cadastro'),
    ('empresas.salas'),
    ('empresas.grupos')
) as m(menu_chave)
where lower(g.grupo_usuarios) like '%admin%'
on conflict do nothing;

-- Seed: Recepção (menus que o código liberava para o balcão).
insert into public.menu_permissoes_grupo (id_grupo, menu_chave)
select g.id, m.menu_chave
from public.usuarios_grupos g
cross join (
  values
    ('inicio'),
    ('atendimentos.agendamentos'),
    ('pacientes.cadastro'),
    ('pacientes.avaliacoes'),
    ('financeiro.caixa'),
    ('estoque.importacao'),
    ('estoque.saidas')
) as m(menu_chave)
where lower(g.grupo_usuarios) like '%recep%'
on conflict do nothing;

-- Seed: Podólogo — Início e Atendimento.
insert into public.menu_permissoes_grupo (id_grupo, menu_chave)
select g.id, m.menu_chave
from public.usuarios_grupos g
cross join (
  values
    ('inicio'),
    ('atendimentos.atendimento')
) as m(menu_chave)
where lower(g.grupo_usuarios) like '%podolog%'
on conflict do nothing;
