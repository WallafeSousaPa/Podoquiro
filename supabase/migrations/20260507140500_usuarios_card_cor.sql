alter table public.usuarios
  add column if not exists card_cor text null;

comment on column public.usuarios.card_cor is 'Cor do card do usuário em formato HEX (#RRGGBB).';
