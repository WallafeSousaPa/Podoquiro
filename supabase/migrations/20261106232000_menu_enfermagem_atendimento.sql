-- Enfermagem precisa abrir Atendimentos > Atendimento para preencher a ficha.
-- Mesmo acesso mínimo do Podólogo: Início e a fila de atendimento.

insert into public.menu_permissoes_grupo (id_grupo, menu_chave)
select g.id, chave.menu_chave
from public.usuarios_grupos g
cross join (
  values
    ('inicio'),
    ('atendimentos.atendimento')
) as chave (menu_chave)
where lower(btrim(g.grupo_usuarios)) = 'enfermagem'
on conflict (id_grupo, menu_chave) do nothing;
