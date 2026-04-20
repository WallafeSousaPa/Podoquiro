-- Controle explícito: agenda mostra só a coluna do próprio usuário (além do legado por nome "podoquiro").

alter table public.usuarios_grupos
  add column if not exists agenda_apenas_coluna_propria boolean not null default false;

comment on column public.usuarios_grupos.agenda_apenas_coluna_propria is
  'Se true, usuários do grupo veem apenas a própria coluna e os próprios agendamentos na agenda (independente de calendario).';
