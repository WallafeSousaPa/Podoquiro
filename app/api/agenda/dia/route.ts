import { NextResponse } from "next/server";
import { resolveGruposCalendario } from "@/lib/agenda/grupos-calendario";
import {
  getPodeVerTodosAgendamentos,
  getUsuarioAgendaSomentePropriaColuna,
} from "@/lib/agenda/permissoes-calendario";
import {
  carregarUsuariosColunasAgenda,
  filtrarColunasAgendaSomenteUsuarioPodoquiro,
} from "@/lib/agenda/usuarios-colunas-agenda";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nextDayStartIso(dataYmd: string): string {
  const [y, m, d] = dataYmd.split("-").map(Number);
  const t = new Date(y, m - 1, d + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T00:00:00.000-03:00`;
}

function dayStartIso(dataYmd: string): string {
  return `${dataYmd}T00:00:00.000-03:00`;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Nome para exibição: prioriza `nome_completo` (coluna principal em pacientes). */
function nomeExibicaoPaciente(p: {
  nome_completo?: string | null;
  nome_social?: string | null;
  telefone?: string | null;
}, idPaciente: number | string): string {
  const nc = p.nome_completo != null ? String(p.nome_completo).trim() : "";
  const ns = p.nome_social != null ? String(p.nome_social).trim() : "";
  const tel = p.telefone != null ? String(p.telefone).trim() : "";
  return nc || ns || tel || `Paciente #${idPaciente}`;
}

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const data = url.searchParams.get("data")?.trim() ?? "";
  if (!DATA_RE.test(data)) {
    return NextResponse.json(
      { error: "Parâmetro data inválido (use YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  let grupoIds: number[] = [];
  let configuradoNaEmpresa = false;
  try {
    const resolved = await resolveGruposCalendario(supabase, empresaId);
    grupoIds = resolved.ids;
    configuradoNaEmpresa = resolved.configuradoNaEmpresa;
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao carregar grupos." },
      { status: 500 },
    );
  }

  const { data: gruposRows, error: gErr } = await supabase
    .from("usuarios_grupos")
    .select("id, grupo_usuarios")
    .in("id", grupoIds.length ? grupoIds : [-1]);

  if (gErr) {
    console.error(gErr);
    return NextResponse.json({ error: gErr.message }, { status: 500 });
  }

  let usuariosRows: Awaited<ReturnType<typeof carregarUsuariosColunasAgenda>> = [];
  try {
    usuariosRows = await carregarUsuariosColunasAgenda(
      supabase,
      empresaId,
      grupoIds,
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Erro ao carregar profissionais.",
      },
      { status: 500 },
    );
  }

  const [podeVerTodos, somentePropriaColuna] = await Promise.all([
    getPodeVerTodosAgendamentos(supabase, sessionUserId),
    getUsuarioAgendaSomentePropriaColuna(supabase, sessionUserId),
  ]);

  usuariosRows = await filtrarColunasAgendaSomenteUsuarioPodoquiro(
    supabase,
    empresaId,
    sessionUserId,
    usuariosRows,
    somentePropriaColuna,
  );

  const inicioDia = dayStartIso(data);
  const fimIntervalo = nextDayStartIso(data);

  let agQuery = supabase
    .from("agendamentos")
    .select(
      `
      id,
      id_usuario,
      id_paciente,
      id_sala,
      data_hora_inicio,
      data_hora_fim,
      status,
      valor_bruto,
      desconto,
      valor_total,
      observacoes,
      pacientes ( nome_completo, nome_social, telefone )
    `,
    )
    .eq("id_empresa", empresaId)
    .gt("data_hora_fim", inicioDia)
    .lt("data_hora_inicio", fimIntervalo);
  if (!podeVerTodos || somentePropriaColuna) {
    agQuery = agQuery.eq("id_usuario", sessionUserId);
  }
  if (somentePropriaColuna) {
    agQuery = agQuery.in("status", ["pendente", "confirmado", "em_andamento", "faltou"]);
  }
  const { data: agRows, error: aErr } = await agQuery.order("data_hora_inicio", {
    ascending: true,
  });

  if (aErr) {
    console.error(aErr);
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }

  const ids = (agRows ?? []).map((r) => r.id as number);
  let procedimentosPorAg: Record<
    number,
    {
      id: number;
      id_procedimento: number;
      valor_aplicado: number;
      procedimento: string | null;
    }[]
  > = {};
  let pagamentosPorAg: Record<
    number,
    {
      id: number;
      id_forma_pagamento: number;
      id_maquineta: number | null;
      valor_pago: number;
      status_pagamento: string;
      forma_nome: string | null;
      maquineta_nome: string | null;
    }[]
  > = {};

  if (ids.length > 0) {
    const { data: procs, error: pErr } = await supabase
      .from("agendamento_procedimentos")
      .select("id, id_agendamento, id_procedimento, valor_aplicado, procedimentos(procedimento)")
      .in("id_agendamento", ids);

    if (pErr) {
      console.error(pErr);
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    procedimentosPorAg = {};
    for (const row of procs ?? []) {
      const idAg = row.id_agendamento as number;
      const prRaw = row.procedimentos as
        | { procedimento: string }
        | { procedimento: string }[]
        | null
        | undefined;
      const pr = Array.isArray(prRaw) ? prRaw[0] : prRaw;
      if (!procedimentosPorAg[idAg]) procedimentosPorAg[idAg] = [];
      procedimentosPorAg[idAg].push({
        id: row.id as number,
        id_procedimento: row.id_procedimento as number,
        valor_aplicado: Number(row.valor_aplicado),
        procedimento: pr?.procedimento ?? null,
      });
    }

    const { data: pags, error: pgErr } = await supabase
      .from("pagamentos")
      .select(
        "id, id_agendamento, id_forma_pagamento, id_maquineta, valor_pago, status_pagamento, formas_pagamento(nome), maquinetas(nome)",
      )
      .in("id_agendamento", ids);

    if (pgErr) {
      console.error(pgErr);
      return NextResponse.json({ error: pgErr.message }, { status: 500 });
    }

    pagamentosPorAg = {};
    for (const row of pags ?? []) {
      const idAg = row.id_agendamento as number;
      const fpRaw = row.formas_pagamento as
        | { nome: string }
        | { nome: string }[]
        | null
        | undefined;
      const mqRaw = row.maquinetas as
        | { nome: string }
        | { nome: string }[]
        | null
        | undefined;
      const fp = Array.isArray(fpRaw) ? fpRaw[0] : fpRaw;
      const mq = Array.isArray(mqRaw) ? mqRaw[0] : mqRaw;
      if (!pagamentosPorAg[idAg]) pagamentosPorAg[idAg] = [];
      pagamentosPorAg[idAg].push({
        id: row.id as number,
        id_forma_pagamento: row.id_forma_pagamento as number,
        id_maquineta: (row.id_maquineta as number | null) ?? null,
        valor_pago: Number(row.valor_pago),
        status_pagamento: String(row.status_pagamento),
        forma_nome: fp?.nome ?? null,
        maquineta_nome: mq?.nome ?? null,
      });
    }
  }

  const { data: salaMap } = await supabase
    .from("salas")
    .select("id, nome_sala")
    .eq("id_empresa", empresaId);

  const salaById = Object.fromEntries(
    (salaMap ?? []).map((s) => [s.id, { nome_sala: s.nome_sala as string }]),
  );

  const agendamentos = (agRows ?? []).map((r) => {
    const id = r.id as number;
    const pid = r.id_paciente as number;
    const sid = r.id_sala as number;
    const pacRaw = r.pacientes as
      | {
          nome_completo: string | null;
          nome_social: string | null;
          telefone: string | null;
        }
      | {
          nome_completo: string | null;
          nome_social: string | null;
          telefone: string | null;
        }[]
      | null
      | undefined;
    const pac = Array.isArray(pacRaw) ? pacRaw[0] : pacRaw;
    const paciente_nome = pac
      ? nomeExibicaoPaciente(pac, pid)
      : "Paciente";

    return {
      id,
      id_usuario: r.id_usuario as number,
      id_paciente: pid,
      id_sala: sid,
      paciente_nome,
      nome_sala: salaById[sid]?.nome_sala ?? "—",
      data_hora_inicio: r.data_hora_inicio as string,
      data_hora_fim: r.data_hora_fim as string,
      status: r.status as string,
      valor_bruto: Number(r.valor_bruto),
      desconto: Number(r.desconto),
      valor_total: Number(r.valor_total),
      observacoes: (r.observacoes as string | null) ?? null,
      procedimentos: procedimentosPorAg[id] ?? [],
      pagamentos: pagamentosPorAg[id] ?? [],
    };
  });

  const usuarios = (usuariosRows ?? []).map((u) => ({
    id: u.id as number,
    nome:
      (u.nome_completo && String(u.nome_completo).trim()) ||
      (u.usuario as string),
    id_grupo_usuarios: u.id_grupo_usuarios as number,
    card_cor: u.card_cor,
  }));

  return NextResponse.json({
    data,
    gruposCalendario: (gruposRows ?? []).map((g) => ({
      id: g.id,
      grupo_usuarios: g.grupo_usuarios as string,
    })),
    agendaGruposConfigurados: configuradoNaEmpresa,
    /** Grupo podoquiro / flag: ocultar pagamentos no modal de agendamento. */
    ocultarSecaoPagamentosAgenda: somentePropriaColuna,
    usuarios,
    agendamentos,
  });
}
