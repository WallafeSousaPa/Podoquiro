import type { SupabaseClient } from "@supabase/supabase-js";

export type PacientesEvolucaoVinculosInput = {
  condicoes: number[];
  tiposUnha: number[];
  hidroses: number[];
  lesoesMecanicas: number[];
};

function uniqPositiveIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of ids) {
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Substitui vínculos N:N de uma linha de `pacientes_evolucao`.
 * Deve ser chamado após insert/update da linha principal (já com `id` conhecido).
 */
export async function syncPacientesEvolucaoVinculos(
  supabase: SupabaseClient,
  idPacientesEvolucao: number,
  vinculos: PacientesEvolucaoVinculosInput,
): Promise<{ error: string | null }> {
  const ev = idPacientesEvolucao;
  const grupos: [string, string, number[]][] = [
    ["pacientes_evolucao_condicoes", "id_condicao", uniqPositiveIds(vinculos.condicoes)],
    ["pacientes_evolucao_tipos_unha", "id_tipo_unha", uniqPositiveIds(vinculos.tiposUnha)],
    ["pacientes_evolucao_hidroses", "id_hidrose", uniqPositiveIds(vinculos.hidroses)],
    [
      "pacientes_evolucao_lesoes_mecanicas",
      "id_lesoes_mecanicas",
      uniqPositiveIds(vinculos.lesoesMecanicas),
    ],
  ];

  for (const [table, fkCol, ids] of grupos) {
    const { error: delErr } = await supabase.from(table).delete().eq("id_pacientes_evolucao", ev);
    if (delErr) return { error: delErr.message };
    if (ids.length === 0) continue;
    const rows = ids.map((id) => ({
      id_pacientes_evolucao: ev,
      [fkCol]: id,
    }));
    const { error: insErr } = await supabase.from(table).insert(rows);
    if (insErr) return { error: insErr.message };
  }

  return { error: null };
}
