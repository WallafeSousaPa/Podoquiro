import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionPayload } from "@/lib/auth/session";
import { registrarErroAplicacao } from "@/lib/aplicacao/registrar-erro-aplicacao";
import { serializarContextoErro } from "@/lib/aplicacao/serializar-erro";

export async function jsonAnamneseErroComCodigo(
  request: Request,
  supabase: SupabaseClient,
  session: SessionPayload | null,
  params: {
    status: number;
    idPaciente: number | null;
    etapa: string;
    detalhe: unknown;
  },
): Promise<NextResponse> {
  const idUsuario = session ? Number(session.sub) : NaN;
  const idEmpresa = session ? Number(session.idEmpresa) : NaN;
  const detalheStr =
    typeof params.detalhe === "string"
      ? params.detalhe
      : params.detalhe instanceof Error
        ? serializarContextoErro({ etapa: params.etapa }, params.detalhe)
        : serializarContextoErro({ etapa: params.etapa, detalhe: params.detalhe });

  const reg = await registrarErroAplicacao(supabase, {
    origem: `api:pacientes-evolucao:POST:${params.etapa}`,
    idUsuario: Number.isFinite(idUsuario) && idUsuario > 0 ? idUsuario : null,
    idEmpresa: Number.isFinite(idEmpresa) && idEmpresa > 0 ? idEmpresa : null,
    idPaciente: params.idPaciente,
    mensagemUsuario: "Erro ao salvar anamnese",
    detalheTecnico: detalheStr,
    userAgent: request.headers.get("user-agent"),
  });

  if ("falha" in reg) {
    return NextResponse.json(
      {
        error:
          "Erro ao salvar anamnese. Não foi possível registrar o código de suporte; informe ao administrador.",
      },
      { status: params.status },
    );
  }

  return NextResponse.json(
    { error: "Erro ao salvar anamnese.", codigo_erro: reg.id },
    { status: params.status },
  );
}
