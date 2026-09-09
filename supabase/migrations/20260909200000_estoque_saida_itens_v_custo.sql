-- Custo unitário do produto no momento da saída.

alter table public.estoque_saida_itens
  add column if not exists v_custo numeric(14, 4) not null default 0;

comment on column public.estoque_saida_itens.v_custo is
  'Custo unitário do produto (produtos.preco) no momento da saída.';
