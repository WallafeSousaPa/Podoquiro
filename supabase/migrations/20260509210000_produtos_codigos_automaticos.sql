-- SKU e código de barras EAN-13 gerados automaticamente em todo INSERT.
create sequence if not exists public.produtos_sku_seq;
create sequence if not exists public.produtos_ean_seq;

create or replace function public.produtos_ean13_check_digit(base12 text)
returns char
language plpgsql
immutable
as $$
declare
  i int;
  d int;
  s int := 0;
begin
  if length(base12) <> 12 or base12 !~ '^[0-9]{12}$' then
    return '0';
  end if;
  for i in 1..12 loop
    d := substring(base12, i, 1)::int;
    if i % 2 = 1 then
      s := s + d;
    else
      s := s + d * 3;
    end if;
  end loop;
  return chr(48 + ((10 - (s % 10)) % 10));
end;
$$;

create or replace function public.produtos_set_codigos_automaticos()
returns trigger
language plpgsql
as $$
declare
  seq_sku bigint;
  seq_ean bigint;
  base12 text;
  chk char;
begin
  if new.sku is null or btrim(new.sku) = '' then
    seq_sku := nextval('public.produtos_sku_seq');
    new.sku := 'PQ-' || lpad(seq_sku::text, 8, '0');
  end if;

  if new.barcode is null or btrim(new.barcode) = '' then
    seq_ean := nextval('public.produtos_ean_seq');
    base12 := '789' || lpad(seq_ean::text, 9, '0');
    chk := public.produtos_ean13_check_digit(base12);
    new.barcode := base12 || chk;
  end if;

  return new;
end;
$$;

drop trigger if exists produtos_set_codigos_automaticos on public.produtos;
create trigger produtos_set_codigos_automaticos
before insert on public.produtos
for each row
execute function public.produtos_set_codigos_automaticos();
