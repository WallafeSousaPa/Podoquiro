-- Colunas para regras de exibição na agenda (colunas de profissionais) e visão do calendário por grupo.

alter table public.usuarios
  add column if not exists exibir_na_agenda boolean not null default false;

comment on column public.usuarios.exibir_na_agenda is
  'Se true, o usuário aparece como coluna na agenda mesmo fora dos grupos da parametrização (empresa_agenda_grupos / fallback Podólogo).';

alter table public.usuarios_grupos
  add column if not exists calendario boolean not null default false;

comment on column public.usuarios_grupos.calendario is
  'Se true, usuários do grupo visualizam todos os agendamentos da empresa; se false, apenas os agendamentos em que são o profissional (id_usuario).';
