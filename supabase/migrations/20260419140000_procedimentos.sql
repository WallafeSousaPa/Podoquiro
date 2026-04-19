-- Procedimentos por empresa.
-- valor_total = custo_base * (1 + margem_lucro/100) * (1 + taxas_impostos/100)
create table if not exists public.procedimentos (
  id bigint generated always as identity primary key,
  id_empresa bigint not null references public.empresas (id) on delete cascade,
  procedimento text not null,
  custo_base numeric(14, 2) not null,
  margem_lucro numeric(9, 4) not null default 0,
  taxas_impostos numeric(9, 4) not null default 0,
  valor_total numeric(14, 2) generated always as (
    round(
      (custo_base * (1 + margem_lucro / 100.0) * (1 + taxas_impostos / 100.0))::numeric,
      2
    )
  ) stored,
  ativo boolean not null default false,
  ultima_atualizacao timestamptz not null default now(),
  constraint procedimentos_procedimento_nao_vazio check (btrim(procedimento) <> ''),
  constraint procedimentos_custo_nao_negativo check (custo_base >= 0),
  constraint procedimentos_margem_nao_negativa check (margem_lucro >= 0),
  constraint procedimentos_taxas_nao_negativas check (taxas_impostos >= 0)
);

create index if not exists procedimentos_id_empresa_idx on public.procedimentos (id_empresa);

comment on table public.procedimentos is 'Procedimentos ofertados pela empresa; valor_total derivado de custo_base e percentuais.';

create or replace function public.touch_procedimentos_ultima_atualizacao()
returns trigger
language plpgsql
as $$
begin
  new.ultima_atualizacao := now();
  return new;
end;
$$;

drop trigger if exists procedimentos_set_ultima_atualizacao on public.procedimentos;
create trigger procedimentos_set_ultima_atualizacao
before update on public.procedimentos
for each row
execute function public.touch_procedimentos_ultima_atualizacao();
