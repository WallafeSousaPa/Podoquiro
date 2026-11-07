import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getNomeGrupoUsuariosDoUsuario,
  grupoNomePodeFichaAvaliacao,
} from "@/lib/agenda/permissoes-calendario";
import type { SessionPayload } from "@/lib/auth/session";

export function parseEmpresaId(idEmpresa: string): number | null {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseUsuarioId(sub: string): number | null {
  const n = Number(sub);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function respostaSeNaoEnfermagem(
  supabase: SupabaseClient,
  session: SessionPayload,
  mensagem = "Somente Enfermagem, Administrador ou Diretoria pode abrir a avaliação.",
): Promise<NextResponse | null> {
  const userId = parseUsuarioId(session.sub);
  if (!userId) {
    return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
  }
  const nomeGrupo = await getNomeGrupoUsuariosDoUsuario(supabase, userId);
  if (!grupoNomePodeFichaAvaliacao(nomeGrupo)) {
    return NextResponse.json(
    { error: mensagem },
      { status: 403 },
    );
  }
  return null;
}
