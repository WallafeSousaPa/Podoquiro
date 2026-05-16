-- Aceitar PDF no bucket do termo assinado (além de PNG legado).

update storage.buckets
set
  allowed_mime_types = array['application/pdf', 'image/png']::text[]
where id = 'termo_assinatura_virtual';

comment on column public.pacientes_evolucao.arquivo_termo_assinatura_virtual is
  'Caminho no bucket termo_assinatura_virtual (PDF do termo + assinatura, ou legado PNG).';
