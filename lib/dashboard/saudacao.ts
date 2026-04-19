import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export type SaudacaoNomes = {
  /** Preferencialmente `usuarios.nome_completo`; senão o login. */
  nomeCompleto: string;
  /** Ex.: "Clínica Podo #1" ou "Empresa #1" se não houver nome fantasia. */
  nomeEmpresaComId: string;
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

    if (Number.isFinite(userId) && userId > 0 && Number.isFinite(empresaId) && empresaId > 0) {
      const supabase = createAdminClient();
      const [{ data: uRow }, { data: eRow }] = await Promise.all([
        supabase.from("usuarios").select("nome_completo").eq("id", userId).maybeSingle(),
        supabase.from("empresas").select("nome_fantasia").eq("id", empresaId).maybeSingle(),
      ]);
      const nc = uRow?.nome_completo?.trim();
      if (nc) nomeCompleto = nc;
      const nf = eRow?.nome_fantasia?.trim();
      if (nf) nomeFantasia = nf;
    }

    const nomeEmpresaComId = nomeFantasia
      ? `${nomeFantasia} #${idEmpresa}`
      : `Empresa #${idEmpresa}`;

    return { nomeCompleto, nomeEmpresaComId };
  },
);
