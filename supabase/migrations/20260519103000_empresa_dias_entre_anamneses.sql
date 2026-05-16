-- Intervalo mínimo (dias corridos no fuso America/Sao_Paulo) entre anamneses por paciente.
alter table public.empresas
  add column if not exists dias_entre_anamneses integer null;

comment on column public.empresas.dias_entre_anamneses is
  'Número mínimo de dias corridos desde a última anamnese ativa até permitir novo registro. Null = sem exigência.';
