-- Desconto padrão (% loja) e preço promocional opcional.
alter table public.produtos
  add column if not exists desconto_padrao numeric(5, 2) not null default 0;

alter table public.produtos
  add column if not exists preco_venda numeric(10, 2);

alter table public.produtos
  drop constraint if exists produtos_desconto_padrao_range;
alter table public.produtos
  add constraint produtos_desconto_padrao_range
  check (desconto_padrao >= 0 and desconto_padrao <= 100);

alter table public.produtos
  drop constraint if exists produtos_preco_venda_nao_negativo;
alter table public.produtos
  add constraint produtos_preco_venda_nao_negativo
  check (preco_venda is null or preco_venda >= 0);

comment on column public.produtos.desconto_padrao is 'Percentual de desconto padrão da loja (0–100).';
comment on column public.produtos.preco_venda is 'Preço promocional fixo; nulo quando não houver promoção.';
