import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { calcularValorTotal } from "@/lib/agenda/totais";
import { resolveGruposCalendario } from "@/lib/agenda/grupos-calendario";
import {
  getPodeVerTodosAgendamentos,
  getUsuarioAgendaSomentePropriaColuna,
  getNomeGrupoUsuariosDoUsuario,
  grupoNomeVisualizaDescontoProdutoModalCaixa,
  profissionalPodeNaAgenda,
  getUsuarioPodeAgendarRetroativo,
} from "@/lib/agenda/permissoes-calendario";
import {
  inicioEhRetroativo,
  statusAgendamentoIgnoraValidacaoHorario,
} from "@/lib/agenda/validacao-agendamento";
import {
  combinarDataHoraLocalIso,
  linhaPlanilhaTemProcedimentos,
  normalizarNomePlanilha,
  parseDataCivilPlanilha,
  parseHoraPlanilha,
  parseListaValoresMonetariosPlanilha,
  parseStatusPlanilha,
  parseValorMonetarioImportacao,
  splitNomesProcedimentosPlanilha,
  type PendenciaImport,
} from "@/lib/agenda/importacao-planilha-parse";

export type LinhaPlanilhaBruta = {
  numeroLinha: number;
  status: unknown;
  data: unknown;
  horaInicio: unknown;
  horaFim: unknown;
  paciente: unknown;
  profissional: unknown;
  sala: unknown;
  procedimentos: unknown;
  observacoes: unknown;
  valor: unknown;
  valorTotal: unknown;
  /** Correções após associação manual no modal (re-preview). */
  id_paciente_manual?: number | null;
  id_usuario_manual?: number | null;
  id_sala_manual?: number | null;
  status_manual?: string | null;
  data_hora_inicio_manual?: string | null;
  data_hora_fim_manual?: string | null;
  /** id por índice do token em `procedimentos` (split). */
  procedimento_id_por_indice?: Record<string, number>;
};

type CatalogoPaciente = { id: number; nome: string };
type CatalogoUsuario = {
  id: number;
  nome: string;
  id_grupo_usuarios: number;
  exibir_na_agenda: boolean;
};
type CatalogoSala = { id: number; nome: string };
type CatalogoProc = { id: number; nome: string };

export type ProcedimentoResolvido = {
  nomePlanilha: string;
  id_procedimento: number | null;
  valor_aplicado: number;
};

export type LinhaPreviewImport = {
  numeroLinha: number;
  pendencias: PendenciaImport[];
  pronto: boolean;
  status: string | null;
  data_hora_inicio: string | null;
  data_hora_fim: string | null;
  id_paciente: number | null;
  id_usuario: number | null;
  id_sala: number | null;
  procedimentos: ProcedimentoResolvido[];
  observacoes: string | null;
  valor_bruto: number | null;
  valor_total: number | null;
};

/** Menor `id` = cadastro mais antigo (identity sequencial). */
function idMaisAntigo<T extends { id: number }>(candidatos: T[]): number | null {
  if (candidatos.length === 0) return null;
  let best = candidatos[0]!;
  for (let i = 1; i < candidatos.length; i++) {
    const c = candidatos[i]!;
    if (c.id < best.id) best = c;
  }
  return best.id;
}

function resolverPorNome<T extends { id: number; nome: string }>(
  texto: string,
  itens: T[],
): number | null {
  const n = normalizarNomePlanilha(texto);
  if (!n) return null;
  const ex = itens.filter((x) => normalizarNomePlanilha(x.nome) === n);
  if (ex.length >= 1) return idMaisAntigo(ex);
  const starts = itens.filter((x) => normalizarNomePlanilha(x.nome).startsWith(n));
  if (starts.length >= 1) return idMaisAntigo(starts);
  const contains = itens.filter((x) => {
    const cn = normalizarNomePlanilha(x.nome);
    return cn.includes(n) || n.includes(cn);
  });
  if (contains.length >= 1) return idMaisAntigo(contains);
  return null;
}

/** Sala em branco na planilha: usa a sala cadastrada como "01" / "Sala 01". */
function resolverIdSalaPadrao01(salas: CatalogoSala[]): number | null {
  for (const rotulo of ["01", "sala 01", "sala01"]) {
    const id = resolverPorNome(rotulo, salas);
    if (id != null) return id;
  }
  const exatos = salas.filter((s) => {
    const n = normalizarNomePlanilha(s.nome);
    return n === "01" || n === "sala 01" || n === "sala01";
  });
  return idMaisAntigo(exatos);
}

const POSTGREST_PAGE = 1000;

async function loadSupabasePaginated<R>(
  fetchRange: (
    from: number,
    to: number,
  ) => Promise<{ data: R[] | null; error: PostgrestError | null }>,
): Promise<R[]> {
  const out: R[] = [];
  for (let from = 0; ; from += POSTGREST_PAGE) {
    const to = from + POSTGREST_PAGE - 1;
    const { data, error } = await fetchRange(from, to);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < POSTGREST_PAGE) break;
  }
  return out;
}

function descontoPctEntreValores(valorBruto: number, valorTotal: number): number {
  if (valorBruto <= 0) return 0;
  if (valorTotal > valorBruto + 0.01) return 0;
  const d = 100 * (1 - valorTotal / valorBruto);
  return Math.round(Math.min(100, Math.max(0, d)) * 10000) / 10000;
}

export async function carregarCatalogosImportacao(
  supabase: SupabaseClient,
  empresaId: number,
): Promise<{
  pacientes: CatalogoPaciente[];
  usuarios: CatalogoUsuario[];
  salas: CatalogoSala[];
  procedimentos: CatalogoProc[];
  grupoIds: number[];
}> {
  const [{ ids: grupoIds }, pacs, us, sal, prc] = await Promise.all([
    resolveGruposCalendario(supabase, empresaId),
    loadSupabasePaginated(async (from, to) =>
      await supabase
        .from("pacientes")
        .select("id, nome_completo")
        .eq("id_empresa", empresaId)
        .order("nome_completo", { ascending: true })
        .range(from, to),
    ),
    loadSupabasePaginated(async (from, to) =>
      await supabase
        .from("usuarios")
        .select("id, nome_completo, id_grupo_usuarios, exibir_na_agenda, ativo")
        .eq("id_empresa", empresaId)
        .eq("ativo", true)
        .order("nome_completo", { ascending: true })
        .range(from, to),
    ),
    loadSupabasePaginated(async (from, to) =>
      await supabase
        .from("salas")
        .select("id, nome_sala, ativo")
        .eq("id_empresa", empresaId)
        .eq("ativo", true)
        .order("nome_sala", { ascending: true })
        .range(from, to),
    ),
    loadSupabasePaginated(async (from, to) =>
      await supabase
        .from("procedimentos")
        .select("id, procedimento, ativo")
        .eq("id_empresa", empresaId)
        .order("procedimento", { ascending: true })
        .range(from, to),
    ),
  ]);

  const pacientes: CatalogoPaciente[] = pacs.map((r) => ({
    id: r.id as number,
    nome: String(r.nome_completo ?? "").trim() || `Paciente #${r.id}`,
  }));
  const usuarios: CatalogoUsuario[] = us.map((r) => ({
    id: r.id as number,
    nome: String(r.nome_completo ?? "").trim() || `Usuário #${r.id}`,
    id_grupo_usuarios: r.id_grupo_usuarios as number,
    exibir_na_agenda: Boolean(r.exibir_na_agenda),
  }));
  const salas: CatalogoSala[] = sal.map((r) => ({
    id: r.id as number,
    nome: String(r.nome_sala ?? "").trim() || `Sala #${r.id}`,
  }));
  const procedimentos: CatalogoProc[] = prc.map((r) => ({
    id: r.id as number,
    nome: String(r.procedimento ?? "").trim() || `Procedimento #${r.id}`,
  }));

  return { pacientes, usuarios, salas, procedimentos, grupoIds };
}

/**
 * Cria na base procedimentos citados na planilha que ainda não existem (por nome),
 * como inativos. Atualiza `cat.procedimentos` para o preview/importer usar o id novo.
 */
export async function garantirProcedimentosPlanilhaCadastrados(
  supabase: SupabaseClient,
  empresaId: number,
  linhas: LinhaPlanilhaBruta[],
  cat: {
    pacientes: CatalogoPaciente[];
    usuarios: CatalogoUsuario[];
    salas: CatalogoSala[];
    procedimentos: CatalogoProc[];
    grupoIds: number[];
  },
): Promise<void> {
  const porNorm = new Map<string, string>();
  for (const linha of linhas) {
    for (const nomeTok of splitNomesProcedimentosPlanilha(linha.procedimentos)) {
      const trimmed = String(nomeTok).trim();
      if (!trimmed) continue;
      const norm = normalizarNomePlanilha(trimmed);
      if (!norm) continue;
      if (!porNorm.has(norm)) porNorm.set(norm, trimmed);
    }
  }

  for (const [, displayName] of porNorm) {
    if (resolverPorNome(displayName, cat.procedimentos) != null) continue;

    const { data: inserted, error } = await supabase
      .from("procedimentos")
      .insert({
        id_empresa: empresaId,
        procedimento: displayName,
        custo_base: 0,
        margem_lucro: 0,
        taxas_impostos: 0,
        ativo: false,
      })
      .select("id")
      .single();

    if (!error && inserted?.id != null) {
      cat.procedimentos.push({
        id: inserted.id as number,
        nome: displayName,
      });
      continue;
    }

    const { data: rows } = await supabase
      .from("procedimentos")
      .select("id, procedimento")
      .eq("id_empresa", empresaId);
    const dn = normalizarNomePlanilha(displayName);
    const match = (rows ?? []).filter(
      (r) => normalizarNomePlanilha(String(r.procedimento ?? "")) === dn,
    );
    if (match.length >= 1) {
      const oldest = match.reduce((a, b) =>
        (a.id as number) <= (b.id as number) ? a : b,
      );
      const id = oldest.id as number;
      if (!cat.procedimentos.some((p) => p.id === id)) {
        cat.procedimentos.push({
          id,
          nome: String(oldest.procedimento ?? "").trim() || displayName,
        });
      }
    }
  }
}

/** Garante vínculos em lote na importação (evita centenas de queries por linha). */
async function garantirVinculosColaboradorProcedimentosImportacao(
  supabase: SupabaseClient,
  idUsuario: number,
  procIds: number[],
): Promise<void> {
  const ids = [...new Set(procIds.filter((x) => Number.isFinite(x) && x > 0))];
  if (ids.length === 0) return;

  const { data: atuais, error: qErr } = await supabase
    .from("colaboradores_procedimentos")
    .select("id_procedimento")
    .eq("id_usuario", idUsuario)
    .in("id_procedimento", ids);
  if (qErr) throw new Error(qErr.message);

  const existentes = new Set((atuais ?? []).map((r) => Number(r.id_procedimento)));
  const faltantes = ids.filter((id) => !existentes.has(id));
  if (faltantes.length === 0) return;

  const { error: iErr } = await supabase.from("colaboradores_procedimentos").insert(
    faltantes.map((idProc) => ({
      id_usuario: idUsuario,
      id_procedimento: idProc,
      comissao_porcentagem: null,
    })),
  );
  if (iErr && iErr.code !== "23505") {
    throw new Error(iErr.message);
  }
}

export function montarPreviewLinha(
  linha: LinhaPlanilhaBruta,
  cat: {
    pacientes: CatalogoPaciente[];
    usuarios: CatalogoUsuario[];
    salas: CatalogoSala[];
    procedimentos: CatalogoProc[];
    grupoIds: number[];
  },
): LinhaPreviewImport {
  const pendencias: PendenciaImport[] = [];

  let status: string | null =
    linha.status_manual != null && String(linha.status_manual).trim() !== ""
      ? parseStatusPlanilha(linha.status_manual)
      : parseStatusPlanilha(linha.status);
  if (!status) {
    pendencias.push({
      campo: "status",
      textoPlanilha: String(linha.status ?? ""),
      mensagem:
        "Status não reconhecido. Exemplos: Agendado / Curativo agendado → confirmado; Atendido → realizado; Não atendido → cancelado; ou: pendente, confirmado, em andamento, realizado, cancelado, faltou, adiado.",
    });
  }

  const dIni = parseDataCivilPlanilha(linha.data);
  const hIni = parseHoraPlanilha(linha.horaInicio);
  const hFim = parseHoraPlanilha(linha.horaFim);
  let data_hora_inicio: string | null =
    linha.data_hora_inicio_manual && String(linha.data_hora_inicio_manual).trim()
      ? String(linha.data_hora_inicio_manual).trim()
      : null;
  let data_hora_fim: string | null =
    linha.data_hora_fim_manual && String(linha.data_hora_fim_manual).trim()
      ? String(linha.data_hora_fim_manual).trim()
      : null;

  if (!data_hora_inicio) {
    if (!dIni || !hIni) {
      pendencias.push({
        campo: "data_hora_inicio",
        textoPlanilha: `${linha.data ?? ""} ${linha.horaInicio ?? ""}`,
        mensagem: "Data ou hora de início inválida.",
      });
    } else {
      data_hora_inicio = combinarDataHoraLocalIso(dIni, hIni);
      if (!data_hora_inicio) {
        pendencias.push({
          campo: "data_hora_inicio",
          textoPlanilha: `${linha.data} ${linha.horaInicio}`,
          mensagem: "Não foi possível montar data/hora de início.",
        });
      }
    }
  }
  if (!data_hora_fim) {
    if (!dIni || !hFim) {
      pendencias.push({
        campo: "data_hora_fim",
        textoPlanilha: `${linha.data ?? ""} ${linha.horaFim ?? ""}`,
        mensagem: "Data ou hora de fim inválida.",
      });
    } else {
      data_hora_fim = combinarDataHoraLocalIso(dIni, hFim);
      if (!data_hora_fim) {
        pendencias.push({
          campo: "data_hora_fim",
          textoPlanilha: `${linha.data} ${linha.horaFim}`,
          mensagem: "Não foi possível montar data/hora de fim.",
        });
      }
    }
  }
  if (data_hora_inicio && data_hora_fim) {
    const t0 = new Date(data_hora_inicio).getTime();
    const t1 = new Date(data_hora_fim).getTime();
    const ignora = status ? statusAgendamentoIgnoraValidacaoHorario(status) : false;
    if (!ignora && t1 <= t0) {
      pendencias.push({
        campo: "data_hora_fim",
        textoPlanilha: String(linha.horaFim ?? ""),
        mensagem: "Horário de fim deve ser após o início.",
      });
    }
  }

  const pacNome = String(linha.paciente ?? "").trim();
  let id_paciente: number | null =
    linha.id_paciente_manual != null && linha.id_paciente_manual > 0
      ? linha.id_paciente_manual
      : resolverPorNome(pacNome, cat.pacientes);
  if (linha.id_paciente_manual != null && linha.id_paciente_manual > 0) {
    if (!cat.pacientes.some((p) => p.id === linha.id_paciente_manual)) {
      pendencias.push({
        campo: "paciente",
        textoPlanilha: `ID ${linha.id_paciente_manual}`,
        mensagem: "Paciente selecionado inválido para esta empresa.",
      });
      id_paciente = null;
    }
  } else if (!linha.id_paciente_manual) {
    if (!id_paciente && pacNome) {
      pendencias.push({
        campo: "paciente",
        textoPlanilha: pacNome,
        mensagem: "Nenhum paciente encontrado com esse nome.",
      });
    } else if (!pacNome) {
      pendencias.push({
        campo: "paciente",
        textoPlanilha: "",
        mensagem: "Paciente em branco.",
      });
    }
  }

  const profNome = String(linha.profissional ?? "").trim();
  let id_usuario: number | null =
    linha.id_usuario_manual != null && linha.id_usuario_manual > 0
      ? linha.id_usuario_manual
      : null;
  if (!id_usuario) {
    if (!profNome) {
      pendencias.push({
        campo: "profissional",
        textoPlanilha: "",
        mensagem: "Profissional em branco.",
      });
    } else {
      const idU = resolverPorNome(profNome, cat.usuarios);
      if (!idU) {
        pendencias.push({
          campo: "profissional",
          textoPlanilha: profNome,
          mensagem: "Nenhum profissional encontrado com esse nome.",
        });
      } else {
        const u = cat.usuarios.find((x) => x.id === idU);
        if (
          u &&
          !profissionalPodeNaAgenda(cat.grupoIds, u.id_grupo_usuarios, u.exibir_na_agenda)
        ) {
          pendencias.push({
            campo: "profissional",
            textoPlanilha: profNome,
            mensagem:
              "Profissional não está habilitado na agenda (grupo ou \"Exibir na agenda\").",
          });
        } else {
          id_usuario = idU;
        }
      }
    }
  } else {
    const u = cat.usuarios.find((x) => x.id === id_usuario);
    if (
      u &&
      !profissionalPodeNaAgenda(cat.grupoIds, u.id_grupo_usuarios, u.exibir_na_agenda)
    ) {
      pendencias.push({
        campo: "profissional",
        textoPlanilha: profNome || `ID ${id_usuario}`,
        mensagem:
          "Profissional não está habilitado na agenda (grupo ou \"Exibir na agenda\").",
      });
      id_usuario = null;
    } else if (!u) {
      pendencias.push({
        campo: "profissional",
        textoPlanilha: `ID ${id_usuario}`,
        mensagem: "Profissional selecionado inválido para esta empresa.",
      });
      id_usuario = null;
    }
  }

  const salaNome = String(linha.sala ?? "").trim();
  let id_sala: number | null =
    linha.id_sala_manual != null && linha.id_sala_manual > 0
      ? linha.id_sala_manual
      : resolverPorNome(salaNome, cat.salas);
  if (linha.id_sala_manual != null && linha.id_sala_manual > 0) {
    if (!cat.salas.some((s) => s.id === linha.id_sala_manual)) {
      pendencias.push({
        campo: "sala",
        textoPlanilha: `ID ${linha.id_sala_manual}`,
        mensagem: "Sala selecionada inválida para esta empresa.",
      });
      id_sala = null;
    }
  } else if (!linha.id_sala_manual) {
    if (!salaNome) {
      const padrao = resolverIdSalaPadrao01(cat.salas);
      if (padrao != null) {
        id_sala = padrao;
      } else {
        pendencias.push({
          campo: "sala",
          textoPlanilha: "",
          mensagem:
            "Sala em branco: cadastre uma sala identificável como \"01\" (ex.: nome \"01\" ou \"Sala 01\") ou preencha a coluna Sala.",
        });
      }
    } else if (!id_sala) {
      pendencias.push({
        campo: "sala",
        textoPlanilha: salaNome,
        mensagem: "Nenhuma sala encontrada com esse nome.",
      });
    }
  }

  const nomesProc = splitNomesProcedimentosPlanilha(linha.procedimentos);
  const procedimentos: ProcedimentoResolvido[] = [];
  const listaValores = parseListaValoresMonetariosPlanilha(linha.valor);

  /**
   * Um único procedimento e vários valores na célula → soma em um valor.
   * Um único valor na célula → divide entre os procedimentos.
   * Vários valores e vários procedimentos → um valor por procedimento (ordem); falta → 0; sobra → ignora.
   */
  let valoresPorProc: number[] = [];
  if (listaValores != null && nomesProc.length > 0) {
    if (nomesProc.length === 1 && listaValores.length > 1) {
      const soma =
        Math.round(listaValores.reduce((acc, v) => acc + v, 0) * 100) / 100;
      valoresPorProc = [soma];
    } else if (listaValores.length === 1) {
      const parte =
        Math.round((listaValores[0]! / nomesProc.length) * 100) / 100;
      valoresPorProc = nomesProc.map(() => parte);
    } else {
      valoresPorProc = nomesProc.map((_, idx) =>
        idx < listaValores.length
          ? Math.round(listaValores[idx]! * 100) / 100
          : 0,
      );
    }
  }

  const valorPorProcedimento = (idx: number): number => valoresPorProc[idx] ?? 0;

  nomesProc.forEach((nomeTok, idx) => {
    const manualId = linha.procedimento_id_por_indice?.[String(idx)];
    let idp =
      manualId != null && manualId > 0
        ? manualId
        : resolverPorNome(nomeTok, cat.procedimentos);
    if (idp != null && idp > 0 && !cat.procedimentos.some((pr) => pr.id === idp)) {
      pendencias.push({
        campo: "procedimento",
        indiceProcedimento: idx,
        textoPlanilha: nomeTok,
        mensagem: "Procedimento selecionado inválido para esta empresa.",
      });
      idp = null;
    }
    if (!idp) {
      pendencias.push({
        campo: "procedimento",
        indiceProcedimento: idx,
        textoPlanilha: nomeTok,
        mensagem: "Procedimento não encontrado com esse nome.",
      });
      procedimentos.push({
        nomePlanilha: nomeTok,
        id_procedimento: null,
        valor_aplicado: valorPorProcedimento(idx),
      });
    } else {
      procedimentos.push({
        nomePlanilha: nomeTok,
        id_procedimento: idp,
        valor_aplicado: valorPorProcedimento(idx),
      });
    }
  });

  const valor_bruto =
    listaValores == null
      ? null
      : nomesProc.length > 0
        ? Math.round(valoresPorProc.reduce((s, v) => s + v, 0) * 100) / 100
        : parseValorMonetarioImportacao(linha.valor);
  const valor_total = parseValorMonetarioImportacao(linha.valorTotal);
  if (valor_bruto == null) {
    pendencias.push({
      campo: "valor",
      textoPlanilha: String(linha.valor ?? ""),
      mensagem: "Valor (bruto) inválido.",
    });
  }
  if (valor_total == null) {
    pendencias.push({
      campo: "valor_total",
      textoPlanilha: String(linha.valorTotal ?? ""),
      mensagem: "Valor total inválido.",
    });
  }
  if (
    valor_bruto != null &&
    valor_total != null &&
    valor_total > valor_bruto + 0.02
  ) {
    pendencias.push({
      campo: "valor_total",
      textoPlanilha: String(linha.valorTotal ?? ""),
      mensagem: "Valor total não pode ser maior que o valor (bruto).",
    });
  }

  const obs =
    typeof linha.observacoes === "string" && linha.observacoes.trim()
      ? linha.observacoes.trim()
      : null;

  const pronto =
    pendencias.length === 0 &&
    status != null &&
    data_hora_inicio != null &&
    data_hora_fim != null &&
    id_paciente != null &&
    id_usuario != null &&
    id_sala != null &&
    procedimentos.length > 0 &&
    procedimentos.every((p) => p.id_procedimento != null) &&
    valor_bruto != null &&
    valor_total != null;

  return {
    numeroLinha: linha.numeroLinha,
    pendencias,
    pronto,
    status,
    data_hora_inicio,
    data_hora_fim,
    id_paciente,
    id_usuario,
    id_sala,
    procedimentos,
    observacoes: obs,
    valor_bruto,
    valor_total,
  };
}

export type LinhaExecutarImport = {
  numeroLinha: number;
  status: string;
  data_hora_inicio: string;
  data_hora_fim: string;
  id_paciente: number;
  id_usuario: number;
  id_sala: number;
  procedimentos: { id_procedimento: number; valor_aplicado: number }[];
  observacoes: string | null;
  valor_bruto: number;
  valor_total: number;
};

export type ResultadoLinhaExecutar = {
  numeroLinha: number;
  ok: boolean;
  id_agendamento?: number;
  error?: string;
};

const MSG_NAO_SALVO_POR_ERRO_EM_OUTRA =
  "Esta linha estaria correta, mas a importação não foi salva porque há erro em outra linha ou conflito entre linhas da planilha.";

const MSG_NAO_SALVO_ROLLBACK =
  "Não salvo: a importação foi cancelada por erro ao gravar; nenhum dado desta importação permaneceu na base.";

async function validarLinhaExecutarImportacao(
  supabase: SupabaseClient,
  empresaId: number,
  sessionUserId: number,
  grupoIds: number[],
  podeVerTodos: boolean,
  somentePropriaColuna: boolean,
  podeAgendarRetroativo: boolean,
  linha: LinhaExecutarImport,
): Promise<string | null> {
  if ((!podeVerTodos || somentePropriaColuna) && linha.id_usuario !== sessionUserId) {
    return "Sem permissão para criar agendamento de outro profissional.";
  }

  const ignora = statusAgendamentoIgnoraValidacaoHorario(linha.status);
  if (!ignora && !podeAgendarRetroativo && inicioEhRetroativo(new Date(linha.data_hora_inicio))) {
    return "Não é permitido agendar horário retroativo para este perfil. Ajuste a data ou use um usuário com permissão.";
  }

  const { data: uRow, error: uErr } = await supabase
    .from("usuarios")
    .select("id, id_empresa, id_grupo_usuarios, ativo, exibir_na_agenda")
    .eq("id", linha.id_usuario)
    .maybeSingle();
  if (uErr || !uRow || (uRow.id_empresa as number) !== empresaId || !uRow.ativo) {
    return "Profissional inválido.";
  }
  if (
    !profissionalPodeNaAgenda(
      grupoIds,
      uRow.id_grupo_usuarios as number,
      Boolean(uRow.exibir_na_agenda),
    )
  ) {
    return "Profissional não habilitado na agenda.";
  }

  const { data: pacRow, error: pacErr } = await supabase
    .from("pacientes")
    .select("id, id_empresa")
    .eq("id", linha.id_paciente)
    .maybeSingle();
  if (pacErr || !pacRow || (pacRow.id_empresa as number) !== empresaId) {
    return "Paciente inválido.";
  }

  const { data: salaRow, error: salaErr } = await supabase
    .from("salas")
    .select("id, id_empresa")
    .eq("id", linha.id_sala)
    .maybeSingle();
  if (salaErr || !salaRow || (salaRow.id_empresa as number) !== empresaId) {
    return "Sala inválida.";
  }

  const procIds = [...new Set(linha.procedimentos.map((p) => p.id_procedimento))];
  if (procIds.length !== linha.procedimentos.length) {
    return "Procedimento duplicado na linha.";
  }
  if (procIds.length > 0) {
    const { data: procRows, error: procErr } = await supabase
      .from("procedimentos")
      .select("id, id_empresa")
      .in("id", procIds);
    if (procErr) return procErr.message;
    const procOk = new Map((procRows ?? []).map((r) => [r.id as number, r.id_empresa as number]));
    for (const pid of procIds) {
      if (procOk.get(pid) !== empresaId) {
        return "Procedimento inválido para esta empresa.";
      }
    }
    try {
      await garantirVinculosColaboradorProcedimentosImportacao(
        supabase,
        linha.id_usuario,
        procIds,
      );
    } catch (e) {
      return e instanceof Error ? e.message : "Erro ao validar procedimentos.";
    }
  }

  /** Importação em massa: não valida sobreposição na agenda (planilha pode ter vários atendimentos no mesmo horário/profissional). */

  const somaProc =
    Math.round(linha.procedimentos.reduce((s, p) => s + p.valor_aplicado, 0) * 100) / 100;
  const vb = Math.round(linha.valor_bruto * 100) / 100;
  const vt = Math.round(linha.valor_total * 100) / 100;
  if (Math.abs(somaProc - vb) > 0.05) {
    return `A soma dos valores aplicados dos procedimentos (${somaProc.toFixed(2)}) difere do valor bruto (${vb.toFixed(2)}).`;
  }

  const desconto = descontoPctEntreValores(vb, vt);
  const valorTotalCalc = calcularValorTotal(vb, desconto);
  if (Math.abs(valorTotalCalc - vt) > 0.05) {
    return "Valor total e valor bruto/desconto não fecham com a precisão esperada. Ajuste os valores na planilha.";
  }

  return null;
}

export type ExecutarImportacaoAgendamentosResponse = {
  salvou: boolean;
  resultados: ResultadoLinhaExecutar[];
};

export async function executarImportacaoAgendamentos(
  supabase: SupabaseClient,
  empresaId: number,
  sessionUserId: number,
  linhas: LinhaExecutarImport[],
): Promise<ExecutarImportacaoAgendamentosResponse> {
  const nomeGrupo = await getNomeGrupoUsuariosDoUsuario(supabase, sessionUserId);
  const podeProcedimentos = grupoNomeVisualizaDescontoProdutoModalCaixa(nomeGrupo);
  if (!podeProcedimentos) {
    return {
      salvou: false,
      resultados: linhas.map((l) => ({
        numeroLinha: l.numeroLinha,
        ok: false,
        error:
          "A importação com procedimentos exige perfil Administrador ou Administrativo.",
      })),
    };
  }

  const [podeVerTodos, somentePropriaColuna] = await Promise.all([
    getPodeVerTodosAgendamentos(supabase, sessionUserId),
    getUsuarioAgendaSomentePropriaColuna(supabase, sessionUserId),
  ]);
  const podeAgendarRetroativo = await getUsuarioPodeAgendarRetroativo(
    supabase,
    sessionUserId,
  );
  const { ids: grupoIds } = await resolveGruposCalendario(supabase, empresaId);

  const errosPorIndice: (string | null)[] = new Array(linhas.length).fill(null);
  for (let i = 0; i < linhas.length; i++) {
    errosPorIndice[i] = await validarLinhaExecutarImportacao(
      supabase,
      empresaId,
      sessionUserId,
      grupoIds,
      podeVerTodos,
      somentePropriaColuna,
      podeAgendarRetroativo,
      linhas[i],
    );
  }

  const temErro = errosPorIndice.some((e) => e != null);
  if (temErro) {
    return {
      salvou: false,
      resultados: linhas.map((l, i) =>
        errosPorIndice[i]
          ? { numeroLinha: l.numeroLinha, ok: false, error: errosPorIndice[i]! }
          : { numeroLinha: l.numeroLinha, ok: false, error: MSG_NAO_SALVO_POR_ERRO_EM_OUTRA },
      ),
    };
  }

  const idsCriados: number[] = [];
  const resultados: ResultadoLinhaExecutar[] = [];
  let falhaInsertIdx: number | null = null;
  let falhaInsertMsg: string | null = null;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const vb = Math.round(linha.valor_bruto * 100) / 100;
    const vt = Math.round(linha.valor_total * 100) / 100;
    const desconto = descontoPctEntreValores(vb, vt);

    const { data: insAg, error: insErr } = await supabase
      .from("agendamentos")
      .insert({
        id_empresa: empresaId,
        id_usuario: linha.id_usuario,
        id_paciente: linha.id_paciente,
        id_sala: linha.id_sala,
        data_hora_inicio: linha.data_hora_inicio,
        data_hora_fim: linha.data_hora_fim,
        status: linha.status,
        valor_bruto: vb,
        desconto,
        valor_total: vt,
        observacoes: linha.observacoes,
      })
      .select("id")
      .single();

    if (insErr || !insAg) {
      falhaInsertIdx = i;
      falhaInsertMsg = insErr?.message ?? "Erro ao salvar agendamento.";
      break;
    }

    const idAg = insAg.id as number;
    idsCriados.push(idAg);

    if (linha.procedimentos.length > 0) {
      const { error: apErr } = await supabase.from("agendamento_procedimentos").insert(
        linha.procedimentos.map((p) => ({
          id_agendamento: idAg,
          id_procedimento: p.id_procedimento,
          valor_aplicado: p.valor_aplicado,
        })),
      );
      if (apErr) {
        falhaInsertIdx = i;
        falhaInsertMsg = apErr.message;
        break;
      }
    }

    resultados.push({ numeroLinha: linha.numeroLinha, ok: true, id_agendamento: idAg });
  }

  if (falhaInsertIdx != null) {
    if (idsCriados.length > 0) {
      await supabase.from("agendamentos").delete().in("id", idsCriados);
    }
    return {
      salvou: false,
      resultados: linhas.map((l, i) => {
        if (i < falhaInsertIdx!) {
          return { numeroLinha: l.numeroLinha, ok: false, error: MSG_NAO_SALVO_ROLLBACK };
        }
        if (i === falhaInsertIdx!) {
          return {
            numeroLinha: l.numeroLinha,
            ok: false,
            error: falhaInsertMsg ?? "Erro ao gravar.",
          };
        }
        return {
          numeroLinha: l.numeroLinha,
          ok: false,
          error:
            "Não salvo: a importação parou por um erro ao gravar antes de chegar nesta linha.",
        };
      }),
    };
  }

  return { salvou: true, resultados };
}

export type CatalogosImportacaoResponse = {
  pacientes: { id: number; nome: string }[];
  usuarios: { id: number; nome: string }[];
  salas: { id: number; nome: string }[];
  procedimentos: { id: number; nome: string }[];
};

export type ResumoPreviewImportacao = {
  totalRecebidas: number;
  ignoradasSemProcedimento: number;
  analisadasComProcedimento: number;
  prontasParaImportar: number;
  comPendencia: number;
};

export async function previewImportacaoCompleto(
  supabase: SupabaseClient,
  empresaId: number,
  linhas: LinhaPlanilhaBruta[],
): Promise<{
  linhasPendentes: LinhaPreviewImport[];
  linhasProntas: LinhaPreviewImport[];
  catalogos: CatalogosImportacaoResponse;
  resumo: ResumoPreviewImportacao;
}> {
  const cat = await carregarCatalogosImportacao(supabase, empresaId);
  const totalRecebidas = linhas.length;
  const comProc = linhas.filter((l) => linhaPlanilhaTemProcedimentos(l.procedimentos));
  const ignoradasSemProcedimento = totalRecebidas - comProc.length;
  await garantirProcedimentosPlanilhaCadastrados(supabase, empresaId, comProc, cat);
  const linhasPreview = comProc.map((l) => montarPreviewLinha(l, cat));
  const linhasProntas = linhasPreview.filter((x) => x.pronto);
  const linhasPendentes = linhasPreview.filter((x) => !x.pronto);
  return {
    linhasPendentes,
    linhasProntas,
    catalogos: {
      pacientes: cat.pacientes,
      usuarios: cat.usuarios.map(({ id, nome }) => ({ id, nome })),
      salas: cat.salas,
      procedimentos: cat.procedimentos,
    },
    resumo: {
      totalRecebidas,
      ignoradasSemProcedimento,
      analisadasComProcedimento: comProc.length,
      prontasParaImportar: linhasProntas.length,
      comPendencia: linhasPendentes.length,
    },
  };
}
