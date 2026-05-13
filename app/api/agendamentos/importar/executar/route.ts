import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  type LinhaExecutarImport,
  executarImportacaoAgendamentos,
} from "@/lib/agenda/importacao-planilha-servico";
import { MAX_LINHAS_IMPORTACAO_AGENDAMENTOS } from "@/lib/agenda/importacao-planilha-limites";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function linhaExecutarValida(x: unknown): x is LinhaExecutarImport {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const n = (k: string) => Number(o[k]);
  const s = (k: string) => (typeof o[k] === "string" ? o[k] : "");
  if (!Number.isFinite(n("numeroLinha")) || n("numeroLinha") <= 0) return false;
  if (typeof o.status !== "string" || !o.status.trim()) return false;
  if (typeof o.data_hora_inicio !== "string" || !o.data_hora_inicio.trim()) return false;
  if (typeof o.data_hora_fim !== "string" || !o.data_hora_fim.trim()) return false;
  if (!Number.isFinite(n("id_paciente")) || n("id_paciente") <= 0) return false;
  if (!Number.isFinite(n("id_usuario")) || n("id_usuario") <= 0) return false;
  if (!Number.isFinite(n("id_sala")) || n("id_sala") <= 0) return false;
  if (!Number.isFinite(n("valor_bruto")) || n("valor_bruto") < 0) return false;
  if (!Number.isFinite(n("valor_total")) || n("valor_total") < 0) return false;
  if (!Array.isArray(o.procedimentos)) return false;
  for (const p of o.procedimentos) {
    if (!p || typeof p !== "object") return false;
    const q = p as Record<string, unknown>;
    if (!Number.isFinite(Number(q.id_procedimento)) || Number(q.id_procedimento) <= 0)
      return false;
    if (!Number.isFinite(Number(q.valor_aplicado)) || Number(q.valor_aplicado) < 0)
      return false;
  }
  return true;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const sessionUserId = Number(session.sub);
  if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  let body: { linhas?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const raw = Array.isArray(body.linhas) ? body.linhas : [];
  if (raw.length === 0) {
    return NextResponse.json({ error: "Envie ao menos uma linha." }, { status: 400 });
  }
  if (raw.length > MAX_LINHAS_IMPORTACAO_AGENDAMENTOS) {
    return NextResponse.json(
      {
        error: `No máximo ${MAX_LINHAS_IMPORTACAO_AGENDAMENTOS.toLocaleString("pt-BR")} linhas por importação.`,
      },
      { status: 400 },
    );
  }

  const linhas: LinhaExecutarImport[] = [];
  for (const x of raw) {
    if (!linhaExecutarValida(x)) {
      return NextResponse.json(
        { error: "Payload de linha inválido. Refaça a pré-visualização e tente novamente." },
        { status: 400 },
      );
    }
    const o = x as Record<string, unknown>;
    const obs =
      o.observacoes === null || typeof o.observacoes === "undefined"
        ? null
        : typeof o.observacoes === "string"
          ? o.observacoes.trim() || null
          : null;
    linhas.push({
      numeroLinha: Number(o.numeroLinha),
      status: String(o.status).trim(),
      data_hora_inicio: String(o.data_hora_inicio).trim(),
      data_hora_fim: String(o.data_hora_fim).trim(),
      id_paciente: Number(o.id_paciente),
      id_usuario: Number(o.id_usuario),
      id_sala: Number(o.id_sala),
      procedimentos: (o.procedimentos as { id_procedimento: number; valor_aplicado: number }[]).map(
        (p) => ({
          id_procedimento: Number(p.id_procedimento),
          valor_aplicado: Math.round(Number(p.valor_aplicado) * 100) / 100,
        }),
      ),
      observacoes: obs,
      valor_bruto: Math.round(Number(o.valor_bruto) * 100) / 100,
      valor_total: Math.round(Number(o.valor_total) * 100) / 100,
    });
  }

  const supabase = createAdminClient();
  try {
    const { salvou, resultados } = await executarImportacaoAgendamentos(
      supabase,
      empresaId,
      sessionUserId,
      linhas,
    );
    if (!salvou) {
      return NextResponse.json(
        {
          error:
            "Nenhum agendamento foi salvo: corrija os erros indicados em cada linha (ou conflitos na importação) e tente novamente.",
          salvou: false,
          resultados,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ salvou: true, resultados });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao importar." },
      { status: 500 },
    );
  }
}
