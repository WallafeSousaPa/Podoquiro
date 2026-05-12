-- Distingue emissões de teste/diagnóstico das NF-e de mercadoria emitidas pela tela de produtos.
alter table public.nfe_emissoes
  add column if not exists escopo_emissao text;

update public.nfe_emissoes
set escopo_emissao = 'geral'
where escopo_emissao is null;

alter table public.nfe_emissoes
  alter column escopo_emissao set default 'geral',
  alter column escopo_emissao set not null;

alter table public.nfe_emissoes drop constraint if exists nfe_emissoes_escopo_chk;
alter table public.nfe_emissoes
  add constraint nfe_emissoes_escopo_chk
  check (escopo_emissao in ('geral', 'teste', 'produto'));

comment on column public.nfe_emissoes.escopo_emissao is
  'geral = legado; teste = status/envio mínimo homolog.; produto = NF-e mercadoria nacional (tela Notas de produto).';
