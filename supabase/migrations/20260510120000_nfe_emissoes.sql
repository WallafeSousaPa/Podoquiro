-- Registro de NF-e modelo 55 emitida diretamente contra SEFAZ (sem provedor).
-- XML e protocolos ficam armazenados após envio; certificado A1 não deve ir para o banco.
create table if not exists public.nfe_emissoes (
  id uuid primary key default gen_random_uuid(),
  id_empresa bigint not null references public.empresas (id) on delete cascade,

  -- 1 = Produção, 2 = Homologação (tpAmb da NF-e)
  ambiente smallint not null default 2,
  constraint nfe_emissoes_ambiente_chk check (ambiente in (1, 2)),

  modelo smallint not null default 55,
  constraint nfe_emissoes_modelo_chk check (modelo = 55),

  serie smallint not null default 1,
  numero_nf integer,

  status text not null default 'rascunho',
  constraint nfe_emissoes_status_chk check (
    status in (
      'rascunho',
      'assinada',
      'transmitida',
      'autorizada',
      'rejeitada',
      'denegada',
      'cancelada'
    )
  ),

  chave_acesso varchar(44),
  protocolo_autorizacao varchar(30),

  c_stat varchar(10),
  x_motivo text,

  xml_enviado text,
  xml_retorno_sefaz text,

  payload_rascunho jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nfe_emissoes_chave_formato_chk check (
    chave_acesso is null or chave_acesso ~ '^[0-9]{44}$'
  )
);

create index if not exists nfe_emissoes_id_empresa_idx on public.nfe_emissoes (id_empresa);
create index if not exists nfe_emissoes_status_idx on public.nfe_emissoes (status);
create index if not exists nfe_emissoes_chave_idx on public.nfe_emissoes (chave_acesso);

comment on table public.nfe_emissoes is 'NF-e mercadoria (mod 55): histórico e XML trocados com SEFAZ.';

create or replace function public.touch_nfe_emissoes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists nfe_emissoes_set_updated_at on public.nfe_emissoes;
create trigger nfe_emissoes_set_updated_at
before update on public.nfe_emissoes
for each row
execute function public.touch_nfe_emissoes_updated_at();
