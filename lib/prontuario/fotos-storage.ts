import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_PRONTUARIO = "Prontuario";

/** Status em que o prontuário pode ser lido ou atualizado. */
export const STATUS_AGENDAMENTO_PRONTUARIO = [
  "em_andamento",
  "realizado",
] as const;

export function statusAgendamentoPermiteProntuario(status: string): boolean {
  return (STATUS_AGENDAMENTO_PRONTUARIO as readonly string[]).includes(status);
}

/** Caminho relativo no bucket (ex.: `1/Paciente_12_0.jpg`). */
export function normalizarPathFotoProntuario(path: string): string {
  let p = path.trim();
  if (!p) return "";

  const urlMatch = p.match(
    /\/object\/(?:sign|public)\/Prontuario\/([^?]+)/i,
  );
  if (urlMatch?.[1]) {
    try {
      p = decodeURIComponent(urlMatch[1]);
    } catch {
      p = urlMatch[1];
    }
  }

  if (p.startsWith("Prontuario/")) {
    p = p.slice("Prontuario/".length);
  }
  return p.replace(/^\/+/, "");
}

export function parsePathsFotosProntuario(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const paths: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const n = normalizarPathFotoProntuario(item);
    if (n) paths.push(n);
  }
  return paths;
}

export async function assinarFotosProntuario(
  supabase: SupabaseClient,
  paths: string[],
  expiresInSegundos = 3600,
): Promise<{ path: string; url: string }[]> {
  const fotos: { path: string; url: string }[] = [];
  for (const path of paths) {
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET_PRONTUARIO)
      .createSignedUrl(path, expiresInSegundos);
    if (signErr) {
      console.error("[prontuario] assinar foto:", path, signErr);
      continue;
    }
    if (signed?.signedUrl) {
      fotos.push({ path, url: signed.signedUrl });
    }
  }
  return fotos;
}
