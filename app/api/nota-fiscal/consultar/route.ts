import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNotaFiscal } from "@/lib/dashboard/nota-fiscal-permissao";
import { listarNfseFocusConsulta } from "@/lib/financeiro/nfse-focus-consulta";
import { validarPeriodoRelatorio } from "@/lib/relatorios/periodo";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(req: Request) {
  const session = await getSession();
  const negado = await respostaSeSemPermissaoNotaFiscal(session);
  if (negado) return negado;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const dataInicio = searchParams.get("data_inicio")?.trim() ?? "";
  const dataFim = searchParams.get("data_fim")?.trim() ?? "";
  const status = searchParams.get("status")?.trim() ?? "";
  const paciente = searchParams.get("paciente")?.trim() ?? "";

  const erroPeriodo = validarPeriodoRelatorio(dataInicio, dataFim);
  if (erroPeriodo) {
    return NextResponse.json({ error: erroPeriodo }, { status: 400 });
  }

  if (paciente.length > 0 && paciente.length < 2) {
    return NextResponse.json(
      { error: "Informe ao menos 2 caracteres no nome do paciente." },
      { status: 400 },
    );
  }

  try {
    const supabase = createAdminClient();
    const rows = await listarNfseFocusConsulta(supabase, {
      empresaId,
      dataInicio,
      dataFim,
      status: status || undefined,
      pacienteBusca: paciente,
    });
    return NextResponse.json({
      rows,
      periodo: { data_inicio: dataInicio, data_fim: dataFim },
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Não foi possível carregar as NFS-e.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
