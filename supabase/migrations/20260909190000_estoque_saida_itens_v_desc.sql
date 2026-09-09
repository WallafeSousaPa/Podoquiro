-- Desconto em R$ por item nas saídas de estoque.

alter table public.estoque_saida_itens
  add column if not exists v_desc numeric(14, 2) not null default 0;

alter table public.estoque_saida_itens
  drop constraint if exists estoque_saida_itens_v_desc_chk;

alter table public.estoque_saida_itens
  add constraint estoque_saida_itens_v_desc_chk check (v_desc >= 0);

comment on column public.estoque_saida_itens.v_desc is
  'Desconto em reais do item, abatido de qtd * v_un para obter v_total.';
