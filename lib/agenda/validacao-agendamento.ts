import type { SupabaseClient } from "@supabase/supabase-js";

export const MSG_HORARIO_RETROATIVO =
  "Não é permitido agendar em data ou horário retroativos. O início do atendimento deve ser igual ou posterior ao horário atual.";

export const MSG_CONFLITO_PROFISSIONAL =
  "Já existe um agendamento para este responsável neste horário. Escolha outro intervalo que não se sobreponha a um agendamento existente.";

export const MSG_PROCEDIMENTO_DUPLICADO =
  "Não é permitido repetir o mesmo procedimento mais de uma vez no mesmo agendamento.";

/** Cancelado ou faltou: validação de intervalo início/fim e conflitos de agenda não se aplicam como nos demais status. */
export function statusAgendamentoIgnoraValidacaoHorario(status: string): boolean {
  return status === "cancelado" || status === "faltou";
}

/** Mantém um único registro por id_procedimento (evita violação de unique no banco). */
export function dedupeProcedimentos(
  items: { id_procedimento: number; valor_aplicado: number }[],
): { id_procedimento: number; valor_aplicado: number }[] {
  const map = new Map<number, { id_procedimento: number; valor_aplicado: number }>();
  for (const p of items) {
    map.set(p.id_procedimento, p);
  }
  return [...map.values()];
}

/**
 * Conflito quando outro agendamento do mesmo profissional (exceto cancelado/faltou) se sobrepõe ao intervalo.
 * Dois intervalos [i1,f1) e [i2,f2] se sobrepõem se i1 < f2 e f1 > i2 (comparando instantes).
 */
export async function haConflitoAgendaProfissional(
  supabase: SupabaseClient,
  args: {
    idEmpresa: number;
    idUsuario: number;
    inicioIso: string;
    fimIso: string;
    ignorarAgendamentoId?: number;
  },
): Promise<boolean> {
  let q = supabase
    .from("agendamentos")
    .select("id")
    .eq("id_empresa", args.idEmpresa)
    .eq("id_usuario", args.idUsuario)
    .neq("status", "cancelado")
    .neq("status", "faltou")
    .gt("data_hora_fim", args.inicioIso)
    .lt("data_hora_inicio", args.fimIso)
    .limit(1);

  if (args.ignorarAgendamentoId != null) {
    q = q.neq("id", args.ignorarAgendamentoId);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export function inicioEhRetroativo(inicio: Date): boolean {
  return inicio.getTime() < Date.now();
}
