-- Cadastro de maquinetas (adquirentes/terminais) para parametrização financeira.
create table if not exists public.maquinetas (
  id bigint generated always as identity primary key,
  nome text not null,
  ativo boolean not null default true,
  constraint maquinetas_nome_nao_vazio check (btrim(nome) <> '')
);

create unique index if not exists maquinetas_nome_lower_uq
  on public.maquinetas (lower(btrim(nome)));

comment on table public.maquinetas is 'Maquinetas/adquirentes (ex.: Ton, Mercado Pago, Rede).';
