import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chaveAcessoDoMotivoSefaz,
  numeroNfDaChaveAcesso,
} from "@/lib/sefaz/nfe/chave-nfe";

function cnpjBase8(cnpj: string | null | undefined): string | null {
  const d = (cnpj ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  return d.slice(0, 8);
}

async function idsEmpresasMesmoCnpjBase(
  supabase: SupabaseClient,
  idEmpresa: number,
  cnpj14: string,
): Promise<number[]> {
  const base = cnpjBase8(cnpj14);
  const ids = new Set<number>([idEmpresa]);
  if (!base) return [...ids];

  const { data, error } = await supabase.from("empresas").select("id, cnpj_cpf");
  if (error) throw new Error(error.message);
  for (const e of data ?? []) {
    const id = Number(e.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (cnpjBase8(e.cnpj_cpf as string | null) === base) ids.add(id);
  }
  return [...ids];
}

/**
 * Próximo nNF: uma sequência por CNPJ + modelo + série + ambiente (SEFAZ não separa por loja).
 */
export async function proximoNumeroNf(supabase: SupabaseClient, params: {
  idEmpresa: number;
  cnpj14: string;
  modelo: 55 | 65;
  serie: number;
  ambiente: number;
}): Promise<number> {
  const ids = await idsEmpresasMesmoCnpjBase(supabase, params.idEmpresa, params.cnpj14);
  const { data, error } = await supabase
    .from("nfe_emissoes")
    .select("numero_nf")
    .in("id_empresa", ids)
    .eq("modelo", params.modelo)
    .eq("serie", params.serie)
    .eq("ambiente", params.ambiente)
    .not("numero_nf", "is", null)
    .order("numero_nf", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const max = typeof data?.[0]?.numero_nf === "number" ? data[0].numero_nf : 0;
  return Math.max(0, max) + 1;
}

export function proximoNumeroAposDuplicidade(params: {
  nNFAtual: number;
  chNFe: string | null | undefined;
  xMotivo: string | null | undefined;
}): number {
  const chaveMotivo = chaveAcessoDoMotivoSefaz(params.xMotivo);
  const nExistente =
    numeroNfDaChaveAcesso(params.chNFe) ??
    numeroNfDaChaveAcesso(chaveMotivo) ??
    params.nNFAtual;
  return Math.max(params.nNFAtual, nExistente) + 1;
}
