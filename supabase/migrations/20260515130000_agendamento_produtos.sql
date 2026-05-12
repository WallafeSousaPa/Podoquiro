-- Produtos de estoque vinculados ao agendamento (caixa / faturamento).
create table if not exists public.agendamento_produtos (
  id bigint generated always as identity primary key,
  id_agendamento bigint not null references public.agendamentos (id) on delete cascade,
  id_produto uuid not null references public.produtos (id) on delete restrict,
  qtd numeric(14, 4) not null,
  valor_desconto numeric(14, 2) not null default 0,
  valor_produto numeric(14, 2) not null,
  valor_final numeric(14, 2) not null,
  constraint agendamento_produtos_qtd_positiva check (qtd > 0),
  constraint agendamento_produtos_valores_nao_negativos check (
    valor_desconto >= 0
    and valor_produto >= 0
    and valor_final >= 0
  )
);

create index if not exists agendamento_produtos_id_agendamento_idx
  on public.agendamento_produtos (id_agendamento);

create index if not exists agendamento_produtos_id_produto_idx
  on public.agendamento_produtos (id_produto);

comment on table public.agendamento_produtos is
  'Mercadorias do cadastro produtos no agendamento: qtd × valor_produto (preço na tabela produtos) − valor_desconto = valor_final.';

comment on column public.agendamento_produtos.valor_produto is
  'Cópia do preço unitário de produtos.preco no momento do vínculo.';

comment on column public.agendamento_produtos.valor_desconto is
  'Desconto monetário total na linha (não por unidade).';

comment on column public.agendamento_produtos.valor_final is
  'Total da linha: arredondado, máx.(0, qtd × valor_produto − valor_desconto).';
