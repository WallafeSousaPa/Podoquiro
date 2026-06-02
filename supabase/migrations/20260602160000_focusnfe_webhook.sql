-- Webhook (gatilho) Focus NFe: recebe notificações de mudança de status das NFS-e
-- emitidas e atualiza automaticamente nfse_focus_emissoes.

-- Dados de registro do webhook na Focus, por empresa.
alter table public.empresa_focusnfe_config
  add column if not exists webhook_focus_id text null,
  add column if not exists webhook_url text null,
  add column if not exists webhook_registrado_em timestamptz null;

comment on column public.empresa_focusnfe_config.webhook_focus_id is
  'ID do gatilho (hook) criado na Focus NFe para o evento nfse.';

-- Auditoria de cada notificação recebida (facilita depurar entregas do webhook).
create table if not exists public.focusnfe_webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  id_empresa bigint null references public.empresas (id) on delete set null,
  id_emissao uuid null references public.nfse_focus_emissoes (id) on delete set null,
  focus_ref text null,
  evento text null,
  status_recebido text null,
  payload jsonb null,
  processado boolean not null default false,
  resultado text null,
  created_at timestamptz not null default now()
);

create index if not exists focusnfe_webhook_eventos_ref_idx
  on public.focusnfe_webhook_eventos (focus_ref);
create index if not exists focusnfe_webhook_eventos_empresa_idx
  on public.focusnfe_webhook_eventos (id_empresa);
create index if not exists focusnfe_webhook_eventos_created_idx
  on public.focusnfe_webhook_eventos (created_at desc);

comment on table public.focusnfe_webhook_eventos is
  'Log de notificações (gatilhos) recebidas da Focus NFe para NFS-e.';
