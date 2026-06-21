import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNotaFiscal } from "@/lib/dashboard/nota-fiscal-permissao";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Limites do dia local (America/Belem) a partir de uma data YMD. */
function intervaloDiaIso(ymd: string, fimDoDia: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return fimDoDia ? `${ymd}T23:59:59.999-03:00` : `${ymd}T00:00:00.000-03:00`;
}

/**
 * Lista as notas de produto (NF-e mod. 55 / escopo `produto` e `teste`) gravadas em `nfe_emissoes`.
 * Filtros: período (created_at), status e escopo.
 */
export async function GET(request: Request) {
  const session = await getSession();
  const bloqueio = await respostaSeSemPermissaoNotaFiscal(session);
  if (bloqueio) return bloqueio;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const dataInicio = searchParams.get("data_inicio")?.trim() ?? "";
  const dataFim = searchParams.get("data_fim")?.trim() ?? "";
  const status = searchParams.get("status")?.trim() ?? "";
  const escopo = searchParams.get("escopo")?.trim() ?? "";
  const modelo = searchParams.get("modelo")?.trim() ?? "";

  const supabase = createAdminClient();
  let query = supabase
    .from("nfe_emissoes")
    .select(
      "id, ambiente, serie, numero_nf, modelo, status, chave_acesso, protocolo_autorizacao, c_stat, x_motivo, escopo_emissao, payload_rascunho, created_at",
    )
    .eq("id_empresa", empresaId)
    .in("escopo_emissao", ["produto", "teste"]);

  const inicio = intervaloDiaIso(dataInicio, false);
  if (inicio) query = query.gte("created_at", inicio);
  const fim = intervaloDiaIso(dataFim, true);
  if (fim) query = query.lte("created_at", fim);

  if (status) query = query.eq("status", status);
  if (escopo === "produto" || escopo === "teste") {
    query = query.eq("escopo_emissao", escopo);
  }
  if (modelo === "55" || modelo === "65") {
    query = query.eq("modelo", Number(modelo));
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}
