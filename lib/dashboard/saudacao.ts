import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  grupoUsuariosAdministrador,
  grupoUsuariosMenuRecepcao,
  grupoUsuariosSomenteMenuInicioCalendario,
} from "@/lib/dashboard/menu-grupo";

export type SaudacaoNomes = {
  /** Preferencialmente `usuarios.nome_completo`; senão o login. */
  nomeCompleto: string;
  /** Ex.: "Clínica Podo #1" ou "Empresa #1" se não houver nome fantasia. */
  nomeEmpresaComId: string;
  /** Nome fantasia ou "Empresa #id" (sem sufixo duplicado) — textos curtos / WhatsApp. */
  nomeEmpresaCurto: string;
  /** Só Início (calendário) no menu — ex. grupo Podólogo. */
  somenteMenuInicio: boolean;
  /** Início + Pacientes › Cadastrar + Financeiro › Caixa — ex. grupo Recepção. */
  menuRecepcao: boolean;
  /** Exibe menu Atendimentos › Atendimento (Podólogo e Administrador). */
  menuAtendimento: boolean;
  /** Exceção para agendar em data/hora retroativas (Administrador/Administrativo). */
  podeAgendarRetroativo: boolean;
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
    let somenteMenuInicio = false;
    let menuRecepcao = false;
    let menuAtendimento = false;
    let podeAgendarRetroativo = false;

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
      menuRecepcao = grupoUsuariosMenuRecepcao(nomeGrupo);
      const isPodologo = grupoUsuariosSomenteMenuInicioCalendario(nomeGrupo);
      const isAdministrador = grupoUsuariosAdministrador(nomeGrupo);
      somenteMenuInicio = !menuRecepcao && isPodologo;
      menuAtendimento = isPodologo || isAdministrador;
      podeAgendarRetroativo = isAdministrador;
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
      somenteMenuInicio,
      menuRecepcao,
      menuAtendimento,
      podeAgendarRetroativo,
    };
  },
);
