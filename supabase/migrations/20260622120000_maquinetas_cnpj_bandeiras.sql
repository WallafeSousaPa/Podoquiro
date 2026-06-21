-- CNPJ da credenciadora na maquineta (NFC-e grupo card) e cadastro de bandeiras de cartão.

alter table public.maquinetas
  add column if not exists cnpj text null;

alter table public.maquinetas
  drop constraint if exists maquinetas_cnpj_formato_chk;

alter table public.maquinetas
  add constraint maquinetas_cnpj_formato_chk check (
    cnpj is null
    or regexp_replace(cnpj, '\D', '', 'g') ~ '^\d{14}$'
  );

comment on column public.maquinetas.cnpj is
  'CNPJ da credenciadora/adquirente (14 dígitos), usado na NFC-e quando o pagamento usa esta maquineta.';

create table if not exists public.bandeiras (
  id bigint generated always as identity primary key,
  codigo text not null,
  nome_bandeira text not null,
  ativo boolean not null default true,
  constraint bandeiras_codigo_nao_vazio check (btrim(codigo) <> ''),
  constraint bandeiras_nome_nao_vazio check (btrim(nome_bandeira) <> ''),
  constraint bandeiras_codigo_formato_chk check (
    regexp_replace(codigo, '\D', '', 'g') ~ '^\d{2}$'
  )
);

create unique index if not exists bandeiras_codigo_uq
  on public.bandeiras (codigo);

create unique index if not exists bandeiras_nome_lower_uq
  on public.bandeiras (lower(btrim(nome_bandeira)));

comment on table public.bandeiras is
  'Bandeiras de cartão para NFC-e (código tBand, 2 dígitos).';
comment on column public.bandeiras.codigo is
  'Código da bandeira na NFC-e (tBand), ex.: 01 Visa, 02 Mastercard, 99 Outros.';
comment on column public.bandeiras.nome_bandeira is 'Nome exibido da bandeira (ex.: Visa, Elo).';
