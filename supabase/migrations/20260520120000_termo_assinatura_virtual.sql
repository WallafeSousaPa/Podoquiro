-- Termo de consentimento com assinatura digital (PDF gerado no cliente; PNG legado).

alter table public.pacientes_evolucao
  add column if not exists arquivo_termo_assinatura_virtual text null;

comment on column public.pacientes_evolucao.arquivo_termo_assinatura_virtual is
  'Caminho relativo no bucket storage termo_assinatura_virtual (PDF do termo + assinatura; legado PNG).';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'termo_assinatura_virtual',
  'termo_assinatura_virtual',
  true,
  15728640,
  array['application/pdf', 'image/png']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
