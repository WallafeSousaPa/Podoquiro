-- Habilita o registro de NFC-e (modelo 65) na mesma tabela de emissões.
-- A NFC-e do Pará é autorizada pelo SVRS (mesma infraestrutura da NF-e 55).
alter table public.nfe_emissoes drop constraint if exists nfe_emissoes_modelo_chk;
alter table public.nfe_emissoes
  add constraint nfe_emissoes_modelo_chk check (modelo in (55, 65));

comment on column public.nfe_emissoes.modelo is
  '55 = NF-e (mercadoria); 65 = NFC-e (consumidor final, QR Code + CSC).';

comment on table public.nfe_emissoes is
  'NF-e (mod 55) e NFC-e (mod 65): histórico e XML trocados com a SEFAZ.';
