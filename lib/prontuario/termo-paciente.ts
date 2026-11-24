import type { SupabaseClient } from "@supabase/supabase-js";

export type TermoAssinadoPaciente = {
  tipo: "pdf" | "imagem";
  url: string;
  rotulo: string;
};

const BUCKET_TERMO = "termo_assinatura_virtual";
const BUCKET_FOTO = "evolucao_analise";

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function urlPublica(bucket: string, path: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const relativo = path.trim().replace(/^\/+/, "");
  if (!base || !relativo) return null;
  return `${base}/storage/v1/object/public/${bucket}/${relativo}`;
}

function tipoDoArquivo(path: string): "pdf" | "imagem" {
  const nome = path.toLowerCase().split("?")[0] ?? "";
  if (/\.(png|jpe?g|webp|gif)$/.test(nome)) return "imagem";
  return "pdf";
}

/** Termo mais recente do paciente: assinatura virtual (PDF) ou foto do documento. */
export async function buscarTermoAssinadoPaciente(
  supabase: SupabaseClient,
  idPaciente: number,
): Promise<TermoAssinadoPaciente | null> {
  const { data: evolucoes, error } = await supabase
    .from("pacientes_evolucao")
    .select("arquivo_termo_assinatura_virtual, foto_doc_termo_consentimento")
    .eq("id_paciente", idPaciente)
    .order("data", { ascending: false })
    .limit(40);

  if (error) throw new Error(error.message);

  for (const row of evolucoes ?? []) {
    const pdf = texto(row.arquivo_termo_assinatura_virtual);
    if (pdf) {
      const url = urlPublica(BUCKET_TERMO, pdf);
      if (url) {
        return {
          tipo: tipoDoArquivo(pdf),
          url,
          rotulo: "Termo assinado",
        };
      }
    }
    const foto = texto(row.foto_doc_termo_consentimento);
    if (foto) {
      const url = urlPublica(BUCKET_FOTO, foto);
      if (url) {
        return { tipo: "imagem", url, rotulo: "Termo de consentimento" };
      }
    }
  }

  const { data: fichas, error: fichaErr } = await supabase
    .from("pacientes_ficha_enfermagem")
    .select("arquivo_termo_assinatura_virtual")
    .eq("id_paciente", idPaciente)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (fichaErr) throw new Error(fichaErr.message);

  for (const row of fichas ?? []) {
    const pdf = texto(row.arquivo_termo_assinatura_virtual);
    if (!pdf) continue;
    const url = urlPublica(BUCKET_TERMO, pdf);
    if (!url) continue;
    return {
      tipo: tipoDoArquivo(pdf),
      url,
      rotulo: "Termo assinado",
    };
  }

  return null;
}
