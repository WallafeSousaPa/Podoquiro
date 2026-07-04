-- Backfill inicial: entradas em caixa_movimento a partir dos relatórios de fechamento de caixa.
-- Cada valor > 0 em caixa_relatorios vira uma linha (Dinheiro, Cartão crédito/débito, PIX).
-- Idempotente: não duplica se a migration for reaplicada.

insert into public.caixa_movimento (
  id_empresa,
  data_movimentacao,
  data_vencimento,
  descricao,
  tipo_entrada,
  forma_pagamento,
  parcela,
  valor,
  atendimento_id,
  id_pagamento
)
select
  cr.id_empresa,
  cr.criado_em,
  null,
  format(
    'Importação fechamento caixa (relatório #%s, ref. %s) — %s',
    cr.id,
    to_char(cr.data_referencia, 'DD/MM/YYYY'),
    v.forma_pagamento
  ),
  'caixa_relatorio',
  v.forma_pagamento,
  null,
  round(v.valor::numeric, 2),
  null,
  null
from public.caixa_relatorios cr
cross join lateral (
  values
    ('Dinheiro', cr.valor_dinheiro),
    ('Cartão de Crédito', cr.valor_cartao_credito),
    ('Cartão de Débito', cr.valor_cartao_debito),
    ('PIX', cr.valor_pix)
) as v(forma_pagamento, valor)
where v.valor > 0
  and not exists (
    select 1
    from public.caixa_movimento cm
    where cm.id_empresa = cr.id_empresa
      and cm.tipo_entrada = 'caixa_relatorio'
      and cm.descricao = format(
        'Importação fechamento caixa (relatório #%s, ref. %s) — %s',
        cr.id,
        to_char(cr.data_referencia, 'DD/MM/YYYY'),
        v.forma_pagamento
      )
  );
