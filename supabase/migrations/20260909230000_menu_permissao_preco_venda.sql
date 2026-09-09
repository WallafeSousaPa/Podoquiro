-- Libera a permissão de editar valor de venda para tipos administrativos.

insert into public.menu_permissoes_grupo (id_grupo, menu_chave)
select g.id, 'estoque.cadastro.preco_venda'
from public.usuarios_grupos g
where lower(g.grupo_usuarios) like '%admin%'
on conflict do nothing;
