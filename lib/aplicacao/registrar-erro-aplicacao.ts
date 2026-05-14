import type { SupabaseClient } from "@supabase/supabase-js";

export type RegistrarErroAplicacaoParams = {
  origem: string;
  idUsuario?: number | null;
  idEmpresa?: number | null;
  idPaciente?: number | null;
  mensagemUsuario?: string | null;
  detalheTecnico: string;
  userAgent?: string | null;
};

const MAX_ORIGEM = 200;
const MAX_MSG = 500;
const MAX_DETALHE = 100_000;
const MAX_UA = 2000;

/**
 * Insere linha em `aplicacao_erro_log` (service role). Retorna o `id` para exibir ao usuário.
 */
export async function registrarErroAplicacao(
  supabase: SupabaseClient,
  params: RegistrarErroAplicacaoParams,
): Promise<{ id: number } | { falha: true; motivo: string }> {
  const { data, error } = await supabase
    .from("aplicacao_erro_log")
    .insert({
      origem: params.origem.slice(0, MAX_ORIGEM),
      id_usuario:
        params.idUsuario != null && Number.isFinite(params.idUsuario) && params.idUsuario > 0
          ? params.idUsuario
          : null,
      id_empresa:
        params.idEmpresa != null && Number.isFinite(params.idEmpresa) && params.idEmpresa > 0
          ? params.idEmpresa
          : null,
      id_paciente:
        params.idPaciente != null && Number.isFinite(params.idPaciente) && params.idPaciente > 0
          ? params.idPaciente
          : null,
      mensagem_usuario: params.mensagemUsuario?.slice(0, MAX_MSG) ?? null,
      detalhe_tecnico: params.detalheTecnico.slice(0, MAX_DETALHE),
      user_agent: params.userAgent?.slice(0, MAX_UA) ?? null,
    })
    .select("id")
    .single();

  if (error || data?.id == null) {
    return {
      falha: true,
      motivo: error?.message ?? "insert sem id",
    };
  }
  return { id: data.id as number };
}
