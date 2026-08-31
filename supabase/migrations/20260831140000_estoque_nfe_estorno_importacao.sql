-- Permite registrar estorno ao excluir uma NF-e cuja entrada já havia sido feita.

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
      'estorno_importacao_nfe'
    )
  );
