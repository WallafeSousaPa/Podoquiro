-- Intervalo mínimo (dias corridos) entre avaliações de enfermagem, independente da anamnese do podólogo.

alter table public.empresas
  add column if not exists dias_entre_anamneses_enfermagem integer null;

comment on column public.empresas.dias_entre_anamneses_enfermagem is
  'Dias corridos mínimos desde a última ficha de enfermagem até permitir nova avaliação. Null = sem exigência.';
