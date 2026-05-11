-- Distingue mercadoria (produto) de serviço e vincula cópia espelho do cadastro de procedimentos.
alter table public.produtos
  add column if not exists servico boolean not null default false;

alter table public.produtos
  add column if not exists id_procedimento bigint null references public.procedimentos (id) on delete set null;

create unique index if not exists produtos_id_procedimento_uq
  on public.produtos (id_procedimento)
  where id_procedimento is not null;

comment on column public.produtos.servico is 'true = serviço; false = produto/mercadoria.';
comment on column public.produtos.id_procedimento is 'Quando preenchido, linha gerada a partir do procedimento correspondente.';

-- Espelha procedimentos existentes em produtos (serviço), sem duplicar se já migrado.
insert into public.produtos (
  id_empresa,
  produto,
  preco,
  qtd_estoque,
  desconto_padrao,
  preco_venda,
  ncm,
  cest,
  origem,
  csosn,
  cfop,
  pis_cst,
  cofins_cst,
  ativo,
  servico,
  id_procedimento
)
select
  p.id_empresa,
  left(btrim(p.procedimento), 255),
  p.valor_total,
  0,
  0,
  null,
  '00000000',
  null,
  0,
  '102',
  '5102',
  '07',
  '07',
  p.ativo,
  true,
  p.id
from public.procedimentos p
where not exists (
  select 1
  from public.produtos x
  where x.id_procedimento = p.id
);
