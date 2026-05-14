-- Registro de erros da aplicação (suporte / depuração), gravado pelo service role nas APIs.

create table if not exists public.aplicacao_erro_log (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  origem text not null,
  id_usuario bigint null references public.usuarios (id) on delete set null,
  id_empresa bigint null references public.empresas (id) on delete set null,
  id_paciente bigint null references public.pacientes (id) on delete set null,
  mensagem_usuario text null,
  detalhe_tecnico text not null default '',
  user_agent text null
);

create index if not exists aplicacao_erro_log_criado_em_idx
  on public.aplicacao_erro_log (criado_em desc);

create index if not exists aplicacao_erro_log_origem_idx
  on public.aplicacao_erro_log (origem);

comment on table public.aplicacao_erro_log is
  'Erros reportados pelo backend ou pelo cliente (código de suporte). Acesso via service role nas rotas de API.';

alter table public.aplicacao_erro_log enable row level security;
