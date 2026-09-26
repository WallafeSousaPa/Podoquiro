-- Libera Relatórios > Movimento para quem já vê Relatório caixa.

insert into public.menu_permissoes_grupo (id_grupo, menu_chave)
select g.id_grupo, 'relatorios.movimento'
from public.menu_permissoes_grupo g
where g.menu_chave = 'relatorios.caixa'
on conflict do nothing;

insert into public.menu_permissoes_usuario (id_usuario, menu_chave)
select u.id_usuario, 'relatorios.movimento'
from public.menu_permissoes_usuario u
where u.menu_chave = 'relatorios.caixa'
on conflict do nothing;
