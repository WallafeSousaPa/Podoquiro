-- Permite registrar alteração de preço de venda no histórico do produto.

alter table public.produtos_movimentacao_estoque
  drop constraint if exists produtos_movimentacao_estoque_tipo_chk;

alter table public.produtos_movimentacao_estoque
  add constraint produtos_movimentacao_estoque_tipo_chk check (
    tipo in ('entrada', 'saida', 'preco')
  );

alter table public.produtos_movimentacao_estoque
  drop constraint if exists produtos_movimentacao_estoque_qtd_positiva;

alter table public.produtos_movimentacao_estoque
  add constraint produtos_movimentacao_estoque_qtd_nao_negativa check (quantidade >= 0);

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
      'preco_venda'
    )
  );
