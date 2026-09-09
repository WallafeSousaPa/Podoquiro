-- Margem percentual sobre o custo para calcular o preço de venda.

alter table public.produtos
  add column if not exists percentual_sobre_custo numeric(8, 2);

alter table public.produtos
  drop constraint if exists produtos_percentual_sobre_custo_nao_negativo;

alter table public.produtos
  add constraint produtos_percentual_sobre_custo_nao_negativo
  check (percentual_sobre_custo is null or percentual_sobre_custo >= 0);

comment on column public.produtos.percentual_sobre_custo is
  'Margem percentual sobre o custo (preco). Quando preenchido, preco_venda = preco * (1 + percentual/100).';
