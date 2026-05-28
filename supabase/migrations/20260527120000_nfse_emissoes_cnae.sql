-- CNAE usado na emissão (cadastro municipal / projeto Notaas); LC 116 vai em codigo_servico.
alter table public.nfse_emissoes
  add column if not exists cnae text null;

comment on column public.nfse_emissoes.cnae is
  'CNAE 9 dígitos esperado no projeto Notaas para esta emissão (não vai no POST /emitir).';
