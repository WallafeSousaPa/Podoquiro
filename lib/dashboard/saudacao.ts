import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  grupoUsuariosAdministrador,
  grupoUsuariosNfseNoCaixa,
  grupoUsuariosPodePersonalizarMensagemWhatsappTaxa,
  grupoUsuariosRelatorioCaixa,
  grupoUsuariosSomenteMenuInicioCalendario,
} from "@/lib/dashboard/menu-grupo";
import { usuarioTemMenu, usuarioTemMenuPrefixo } from "@/lib/dashboard/menus-catalogo";
import { menusEfetivosDoUsuario } from "@/lib/dashboard/menus-permissoes";

export type SaudacaoNomes = {
  /** Preferencialmente `usuarios.nome_completo`; senão o login. */
  nomeCompleto: string;
  /** Ex.: "Clínica Podo #1" ou "Empresa #1" se não houver nome fantasia. */
  nomeEmpresaComId: string;
  /** Nome fantasia ou "Empresa #id" (sem sufixo duplicado) — textos curtos / WhatsApp. */
  nomeEmpresaCurto: string;
  /** Chaves do menu lateral liberadas (banco: grupo ou personalização do usuário). */
  menusLiberados: string[];
  /**
   * Comportamento da agenda (não controla mais o menu): grupo Podólogo.
   */
  somenteMenuInicio: boolean;
  /** @deprecated Menu vem de `menusLiberados`. Mantido false. */
  menuRecepcao: boolean;
  /** Exibe tela Atendimentos › Atendimento. */
  menuAtendimento: boolean;
  /** Exceção para agendar em data/hora retroativas (Administrador/Administrativo). */
  podeAgendarRetroativo: boolean;
  /** Relatórios / caixa movimento (derivado dos menus liberados). */
  podeVerRelatorioCaixa: boolean;
  /** Qualquer item de Nota Fiscal. */
  podeVerMenuNotaFiscal: boolean;
  /** Menu Ponto. */
  podeVerMenuPonto: boolean;
  /** Coluna NFS-e no Caixa (ação; ainda por tipo de usuário). */
  podeEmitirNfseNoCaixa: boolean;
  /** Editar mensagem WhatsApp da taxa de agendamento. */
  podePersonalizarMensagemWhatsappTaxa: boolean;
  /** Excluir importação de NF-e e reverter estoque (Administrador / Administrativo). */
  podeExcluirImportacaoEstoque: boolean;
};

/**
 * Dados para saudação no layout e nas páginas. Memoizado por request (React cache).
 */
export const getNomesSaudacao = cache(
  async (sub: string, usuario: string, idEmpresa: string): Promise<SaudacaoNomes> => {
    const userId = Number(sub);
    const empresaId = Number(idEmpresa);
    let nomeCompleto = usuario;
    let nomeFantasia = "";
    let menusLiberados: string[] = [];
    let somenteMenuInicio = false;
    let menuAtendimento = false;
    let podeAgendarRetroativo = false;
    let podeVerRelatorioCaixa = false;
    let podeVerMenuNotaFiscal = false;
    let podeVerMenuPonto = false;
    let podeEmitirNfseNoCaixa = false;
    let podePersonalizarMensagemWhatsappTaxa = false;
    let podeExcluirImportacaoEstoque = false;

    if (Number.isFinite(userId) && userId > 0 && Number.isFinite(empresaId) && empresaId > 0) {
      const supabase = createAdminClient();
      const [{ data: uRow }, { data: eRow }] = await Promise.all([
        supabase
          .from("usuarios")
          .select(
            "nome_completo, usuarios_grupos:usuarios_grupos!usuarios_id_grupo_usuarios_fkey ( grupo_usuarios )",
          )
          .eq("id", userId)
          .maybeSingle(),
        supabase.from("empresas").select("nome_fantasia").eq("id", empresaId).maybeSingle(),
      ]);
      const nc = uRow?.nome_completo?.trim();
      if (nc) nomeCompleto = nc;
      const nf = eRow?.nome_fantasia?.trim();
      if (nf) nomeFantasia = nf;

      type GrupoNome = { grupo_usuarios: string | null };
      const gRaw = uRow?.usuarios_grupos as GrupoNome | GrupoNome[] | null | undefined;
      const g = Array.isArray(gRaw) ? gRaw[0] : gRaw;
      const nomeGrupo = g?.grupo_usuarios;
      const isPodologo = grupoUsuariosSomenteMenuInicioCalendario(nomeGrupo);
      const isAdministrador = grupoUsuariosAdministrador(nomeGrupo);
      somenteMenuInicio = isPodologo;
      podeAgendarRetroativo = isAdministrador;
      podeEmitirNfseNoCaixa = grupoUsuariosNfseNoCaixa(nomeGrupo);
      podePersonalizarMensagemWhatsappTaxa =
        grupoUsuariosPodePersonalizarMensagemWhatsappTaxa(nomeGrupo);
      podeExcluirImportacaoEstoque = grupoUsuariosRelatorioCaixa(nomeGrupo);

      try {
        const efetivo = await menusEfetivosDoUsuario(supabase, userId);
        menusLiberados = efetivo.menus;
      } catch (e) {
        console.error(e);
        menusLiberados = [];
      }

      menuAtendimento = usuarioTemMenu(menusLiberados, "atendimentos.atendimento");
      podeVerMenuNotaFiscal = usuarioTemMenuPrefixo(menusLiberados, "nota-fiscal");
      podeVerMenuPonto = usuarioTemMenu(menusLiberados, "ponto");
      podeVerRelatorioCaixa =
        usuarioTemMenuPrefixo(menusLiberados, "relatorios") ||
        usuarioTemMenu(menusLiberados, "financeiro.caixa-movimento");
    }

    const nomeEmpresaComId = nomeFantasia
      ? `${nomeFantasia} #${idEmpresa}`
      : `Empresa #${idEmpresa}`;
    const nomeEmpresaCurto = nomeFantasia
      ? nomeFantasia
      : `Empresa #${idEmpresa}`;

    return {
      nomeCompleto,
      nomeEmpresaComId,
      nomeEmpresaCurto,
      menusLiberados,
      somenteMenuInicio,
      menuRecepcao: false,
      menuAtendimento,
      podeAgendarRetroativo,
      podeVerRelatorioCaixa,
      podeVerMenuNotaFiscal,
      podeVerMenuPonto,
      podeEmitirNfseNoCaixa,
      podePersonalizarMensagemWhatsappTaxa,
      podeExcluirImportacaoEstoque,
    };
  },
);
