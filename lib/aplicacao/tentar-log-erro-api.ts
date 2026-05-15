import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionPayload } from "@/lib/auth/session";
import { registrarErroAplicacao } from "@/lib/aplicacao/registrar-erro-aplicacao";

export type ContextoLogErroApi = {
  origem: string;
  status: number;
  mensagem: string;
  detalhe?: unknown;
  idPaciente?: number | null;
};

/**
 * Grava em `aplicacao_erro_log` sem falhar a resposta HTTP.
 * Usa limiar para não encher o banco com validações 400 rotineiras.
 */
export async function tentarLogErroApi(
  request: Request,
  supabase: SupabaseClient,
  session: SessionPayload | null,
  ctx: ContextoLogErroApi,
): Promise<void> {
  if (ctx.status < 400) return;
  if (ctx.status === 400) return;

  try {
    const idUsuario = session ? Number(session.sub) : NaN;
    const idEmpresa = session ? Number(session.idEmpresa) : NaN;
    const detalheStr =
      typeof ctx.detalhe === "string"
        ? ctx.detalhe
        : JSON.stringify(
            {
              status: ctx.status,
              mensagem: ctx.mensagem,
              detalhe: ctx.detalhe ?? null,
            },
            null,
            0,
          );

    await registrarErroAplicacao(supabase, {
      origem: ctx.origem.slice(0, 200),
      idUsuario: Number.isFinite(idUsuario) && idUsuario > 0 ? idUsuario : null,
      idEmpresa: Number.isFinite(idEmpresa) && idEmpresa > 0 ? idEmpresa : null,
      idPaciente:
        ctx.idPaciente != null && Number.isFinite(ctx.idPaciente) && ctx.idPaciente > 0
          ? ctx.idPaciente
          : null,
      mensagemUsuario: ctx.mensagem.slice(0, 500),
      detalheTecnico: detalheStr.slice(0, 100_000),
      userAgent: request.headers.get("user-agent"),
    });
  } catch {
    /* não bloquear resposta */
  }
}
