import type { SupabaseClient } from "@supabase/supabase-js";

export const TIPOS_TRATAMENTO_PONTO = [
  "INCLUSAO",
  "CORRECAO_HORARIO",
  "DESCONSIDERACAO",
] as const;

export type TipoTratamentoPonto = (typeof TIPOS_TRATAMENTO_PONTO)[number];

export type TratamentoPontoRegistro = {
  id: number;
  empregador_id: number;
  nsr_referencia: number | null;
  funcionario_id: number;
  data_hora_nova: string;
  tipo_alteracao: TipoTratamentoPonto;
  motivo: string;
  usuario_responsavel_id: number;
  data_hora_processamento: string;
};

const DATETIME_LOCAL_RE =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

export function ehTipoTratamentoPonto(v: string): v is TipoTratamentoPonto {
  return (TIPOS_TRATAMENTO_PONTO as readonly string[]).includes(v);
}

/** Converte `datetime-local` para timestamptz no fuso de Brasília. */
export function datetimeLocalParaIsoBr(valor: string): string | null {
  const m = DATETIME_LOCAL_RE.exec(valor.trim());
  if (!m) return null;
  const [, ymd, hh, mm, ss] = m;
  const h = Number(hh);
  const mi = Number(mm);
  const s = Number(ss ?? "0");
  if (h > 23 || mi > 59 || s > 59) return null;
  return `${ymd}T${hh}:${mm}:${String(s).padStart(2, "0")}.000-03:00`;
}

function parseId(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function criarTratamentoPonto(
  supabase: SupabaseClient,
  args: {
    empresaId: number;
    usuarioId: number;
    tipo: TipoTratamentoPonto;
    funcionarioId: number;
    motivo: string;
    nsrReferencia?: number | null;
    dataHoraNovaIso?: string | null;
  },
): Promise<{ tratamento: TratamentoPontoRegistro }> {
  const motivo = args.motivo.trim();
  if (motivo.length < 5) {
    throw new Error("Informe o motivo do ajuste (mínimo 5 caracteres).");
  }
  if (motivo.length > 500) {
    throw new Error("O motivo deve ter no máximo 500 caracteres.");
  }

  const { data: func, error: errFunc } = await supabase
    .from("funcionarios")
    .select("id, empregador_id, empresa_id, nome, ativo")
    .eq("id", args.funcionarioId)
    .maybeSingle();
  if (errFunc) throw new Error(errFunc.message);
  if (!func) throw new Error("Funcionário não encontrado.");
  if (Number(func.empresa_id) !== args.empresaId) {
    throw new Error("Funcionário não pertence à empresa da sessão.");
  }

  const empregadorId = parseId(func.empregador_id);
  if (!empregadorId) {
    throw new Error("Funcionário sem empregador vinculado.");
  }

  let nsrReferencia: number | null = args.nsrReferencia ?? null;
  let dataHoraNova = args.dataHoraNovaIso?.trim() || "";

  if (args.tipo === "INCLUSAO") {
    nsrReferencia = null;
    if (!dataHoraNova) {
      throw new Error("Informe data e hora da marcação incluída.");
    }
  } else {
    const nsr = parseId(nsrReferencia);
    if (!nsr) {
      throw new Error("Selecione a marcação original que será ajustada.");
    }
    nsrReferencia = nsr;

    const { data: original, error: errOrig } = await supabase
      .from("registros_ponto")
      .select("nsr, empregador_id, funcionario_id, data_hora_fato")
      .eq("empregador_id", empregadorId)
      .eq("nsr", nsr)
      .maybeSingle();
    if (errOrig) throw new Error(errOrig.message);
    if (!original) throw new Error("Marcação original não encontrada.");
    if (Number(original.funcionario_id) !== args.funcionarioId) {
      throw new Error("A marcação não pertence a este funcionário.");
    }

    const { data: jaDesconsiderada, error: errDesc } = await supabase
      .from("tratamentos_ponto")
      .select("id")
      .eq("empregador_id", empregadorId)
      .eq("nsr_referencia", nsr)
      .eq("tipo_alteracao", "DESCONSIDERACAO")
      .limit(1)
      .maybeSingle();
    if (errDesc) throw new Error(errDesc.message);

    if (args.tipo === "DESCONSIDERACAO") {
      if (jaDesconsiderada) {
        throw new Error("Esta marcação já foi desconsiderada.");
      }
      dataHoraNova = String(original.data_hora_fato);
    } else {
      if (jaDesconsiderada) {
        throw new Error("Não é possível corrigir uma marcação desconsiderada.");
      }
      if (!dataHoraNova) {
        throw new Error("Informe o novo horário da marcação.");
      }
    }
  }

  const { data: inserido, error: errIns } = await supabase
    .from("tratamentos_ponto")
    .insert({
      empregador_id: empregadorId,
      nsr_referencia: nsrReferencia,
      funcionario_id: args.funcionarioId,
      data_hora_nova: dataHoraNova,
      tipo_alteracao: args.tipo,
      motivo,
      usuario_responsavel_id: args.usuarioId,
    })
    .select(
      "id, empregador_id, nsr_referencia, funcionario_id, data_hora_nova, tipo_alteracao, motivo, usuario_responsavel_id, data_hora_processamento",
    )
    .single();
  if (errIns) throw new Error(errIns.message);
  if (!inserido) throw new Error("Não foi possível gravar o ajuste.");

  return {
    tratamento: {
      id: Number(inserido.id),
      empregador_id: Number(inserido.empregador_id),
      nsr_referencia:
        inserido.nsr_referencia == null ? null : Number(inserido.nsr_referencia),
      funcionario_id: Number(inserido.funcionario_id),
      data_hora_nova: String(inserido.data_hora_nova),
      tipo_alteracao: inserido.tipo_alteracao as TipoTratamentoPonto,
      motivo: String(inserido.motivo),
      usuario_responsavel_id: Number(inserido.usuario_responsavel_id),
      data_hora_processamento: String(inserido.data_hora_processamento),
    },
  };
}
