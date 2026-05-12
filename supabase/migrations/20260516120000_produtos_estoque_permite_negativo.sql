-- Permite estoque negativo após venda no agendamento (ex.: venda com estoque zerado).
alter table public.produtos drop constraint if exists produtos_estoque_nao_negativo;
