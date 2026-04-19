-- Formas/tipos de pagamento (parametrização financeira).
create table if not exists public.formas_pagamento (
  id bigint generated always as identity primary key,
  nome text not null,
  ativo boolean not null default true,
  constraint formas_pagamento_nome_nao_vazio check (btrim(nome) <> '')
);

create unique index if not exists formas_pagamento_nome_lower_uq
  on public.formas_pagamento (lower(btrim(nome)));

comment on table public.formas_pagamento is 'Formas de pagamento (ex.: Pix, Cartão de crédito).';
