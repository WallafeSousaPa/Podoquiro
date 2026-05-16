-- Cor de destaque dos cards da agenda quando o agendamento inclui o procedimento "Corte técnico".

alter table public.empresas
  add column if not exists agenda_cor_corte_tecnico text null;

comment on column public.empresas.agenda_cor_corte_tecnico is
  'Cor hex (#RRGGBB) para cards com procedimento Corte técnico na agenda. Null = padrão do sistema.';
