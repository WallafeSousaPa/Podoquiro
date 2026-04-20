-- Procedimentos que cada usuário (colaborador) pode executar; comissão opcional.

create table if not exists public.colaboradores_procedimentos (
  id bigint generated always as identity primary key,
  id_usuario bigint not null references public.usuarios (id) on delete cascade,
  id_procedimento bigint not null references public.procedimentos (id) on delete cascade,
  comissao_porcentagem numeric(9, 4) null,
  ultima_atualizacao timestamptz not null default now(),
  constraint colaboradores_procedimentos_usuario_proc_uq unique (id_usuario, id_procedimento),
  constraint colaboradores_procedimentos_comissao_pct check (
    comissao_porcentagem is null
    or (comissao_porcentagem >= 0 and comissao_porcentagem <= 100)
  )
);

create index if not exists colaboradores_procedimentos_id_usuario_idx
  on public.colaboradores_procedimentos (id_usuario);

create index if not exists colaboradores_procedimentos_id_procedimento_idx
  on public.colaboradores_procedimentos (id_procedimento);

comment on table public.colaboradores_procedimentos is
  'Vínculo colaborador ↔ procedimento liberado na agenda; comissão percentual opcional.';

comment on column public.colaboradores_procedimentos.comissao_porcentagem is
  'Percentual de comissão (0–100) ou null se não informado.';

create or replace function public.touch_colaboradores_procedimentos_ultima_atualizacao()
returns trigger
language plpgsql
as $$
begin
  new.ultima_atualizacao := now();
  return new;
end;
$$;

drop trigger if exists colaboradores_procedimentos_set_ultima_atualizacao
  on public.colaboradores_procedimentos;
create trigger colaboradores_procedimentos_set_ultima_atualizacao
before update on public.colaboradores_procedimentos
for each row
execute function public.touch_colaboradores_procedimentos_ultima_atualizacao();
