-- Transferência entre lojas: sai da origem, fica em trânsito e só entra no
-- estoque da destino após confirmação de recebimento.

alter table public.estoque_saidas
  drop constraint if exists estoque_saidas_status_chk;

alter table public.estoque_saidas
  add constraint estoque_saidas_status_chk
  check (status in ('confirmada', 'cancelada', 'em_transito'));

alter table public.estoque_saidas
  add column if not exists recebida_em timestamptz;

alter table public.estoque_saidas
  add column if not exists id_usuario_recebimento bigint null
    references public.usuarios (id) on delete set null;

alter table public.estoque_saida_itens
  add column if not exists id_produto_destino uuid null
    references public.produtos (id) on delete set null;

create index if not exists estoque_saidas_destino_transito_idx
  on public.estoque_saidas (id_empresa_destino, status)
  where tipo = 'transferencia';

alter table public.produtos_movimentacao_estoque
  drop constraint if exists produtos_movimentacao_estoque_origem_chk;

alter table public.produtos_movimentacao_estoque
  add constraint produtos_movimentacao_estoque_origem_chk check (
    origem in (
      'cadastro',
      'ajuste_manual',
      'venda_atendimento',
      'estorno_atendimento',
      'importacao_nfe',
      'estorno_importacao_nfe',
      'saida_venda',
      'saida_transferencia',
      'saida_perda',
      'saida_avulso',
      'estorno_saida',
      'preco_venda',
      'entrada_transferencia',
      'estorno_entrada_transferencia'
    )
  );

comment on column public.estoque_saidas.recebida_em is
  'Momento em que a loja destino confirmou o recebimento da transferência.';
