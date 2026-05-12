import { NextResponse } from "next/server";
import { calcularValorTotal } from "@/lib/agenda/totais";
import { resolveGruposCalendario } from "@/lib/agenda/grupos-calendario";
import {
  getPodeVerTodosAgendamentos,
  getUsuarioPodeAgendarRetroativo,
  getUsuarioAgendaSomentePropriaColuna,
  profissionalPodeNaAgenda,
} from "@/lib/agenda/permissoes-calendario";
import { validarProcedimentosDoColaborador } from "@/lib/colaborador-procedimentos";
import {
  MSG_CONFLITO_PROFISSIONAL,
  MSG_HORARIO_RETROATIVO,
  MSG_PROCEDIMENTO_DUPLICADO,
  haConflitoAgendaProfissional,
  inicioEhRetroativo,
  statusAgendamentoIgnoraValidacaoHorario,
} from "@/lib/agenda/validacao-agendamento";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const AGENDAMENTO_STATUS = [
  "pendente",
  "confirmado",
  "em_andamento",
  "realizado",
  "cancelado",
  "faltou",
  "adiado",
] as const;
type AgendamentoStatus = (typeof AGENDAMENTO_STATUS)[number];

const PAGAMENTO_STATUS = ["pago", "estornado", "pendente"] as const;

function isAgStatus(s: string): s is AgendamentoStatus {
  return (AGENDAMENTO_STATUS as readonly string[]).includes(s);
}

function isPgStatus(s: string): boolean {
  return (PAGAMENTO_STATUS as readonly string[]).includes(s);
}

export async function POST(request: Request) {
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

  let body: {
    id_usuario?: unknown;
    id_paciente?: unknown;
    id_sala?: unknown;
    data_hora_inicio?: unknown;
    data_hora_fim?: unknown;
    status?: unknown;
    desconto?: unknown;
    observacoes?: unknown;
    procedimentos?: unknown;
    pagamentos?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const idUsuario = Number(body.id_usuario);
  const idPaciente = Number(body.id_paciente);
  const idSala = Number(body.id_sala);
  let inicio =
    typeof body.data_hora_inicio === "string" ? body.data_hora_inicio : "";
  let fim = typeof body.data_hora_fim === "string" ? body.data_hora_fim : "";
  const statusStr =
    typeof body.status === "string" ? body.status : "pendente";
  const desconto =
    body.desconto === undefined || body.desconto === null
      ? 0
      : Number(body.desconto);
  const observacoes =
    typeof body.observacoes === "string" ? body.observacoes.trim() || null : null;

  if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
    return NextResponse.json({ error: "Profissional inválido." }, { status: 400 });
  }
  if (!Number.isFinite(idPaciente) || idPaciente <= 0) {
    return NextResponse.json({ error: "Paciente inválido." }, { status: 400 });
  }
  if (!Number.isFinite(idSala) || idSala <= 0) {
    return NextResponse.json({ error: "Sala inválida." }, { status: 400 });
  }
  if (!inicio || !fim) {
    return NextResponse.json(
      { error: "Informe data e hora de início e fim." },
      { status: 400 },
    );
  }
  if (!isAgStatus(statusStr)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }
  if (!Number.isFinite(desconto) || desconto < 0 || desconto > 100) {
    return NextResponse.json(
      { error: "Desconto deve ser entre 0 e 100%." },
      { status: 400 },
    );
  }

  const ignoraValidacaoHorario = statusAgendamentoIgnoraValidacaoHorario(statusStr);

  const t0 = new Date(inicio);
  const t1 = new Date(fim);
  if (Number.isNaN(t0.getTime()) || Number.isNaN(t1.getTime())) {
    return NextResponse.json({ error: "Datas inválidas." }, { status: 400 });
  }
  if (ignoraValidacaoHorario) {
    if (t1 <= t0) {
      const fimAjustado = new Date(t0.getTime() + 60_000);
      inicio = t0.toISOString();
      fim = fimAjustado.toISOString();
    }
  } else if (t1 <= t0) {
    return NextResponse.json(
      { error: "O término deve ser após o início." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const podeAgendarRetroativo = await getUsuarioPodeAgendarRetroativo(
    supabase,
    sessionUserId,
  );
  if (!ignoraValidacaoHorario && !podeAgendarRetroativo && inicioEhRetroativo(new Date(inicio))) {
    return NextResponse.json({ error: MSG_HORARIO_RETROATIVO }, { status: 400 });
  }

  const procedimentos: { id_procedimento: number; valor_aplicado: number }[] = [];
  if (body.procedimentos !== undefined && body.procedimentos !== null) {
    if (!Array.isArray(body.procedimentos)) {
      return NextResponse.json(
        { error: "procedimentos deve ser um array." },
        { status: 400 },
      );
    }
    for (const p of body.procedimentos) {
      if (!p || typeof p !== "object") {
        return NextResponse.json({ error: "Procedimento inválido." }, { status: 400 });
      }
      const o = p as { id_procedimento?: unknown; valor_aplicado?: unknown };
      const ip = Number(o.id_procedimento);
      const va = Number(o.valor_aplicado);
      if (!Number.isFinite(ip) || ip <= 0) {
        return NextResponse.json({ error: "Procedimento inválido." }, { status: 400 });
      }
      if (!Number.isFinite(va) || va < 0) {
        return NextResponse.json(
          { error: "Valor aplicado inválido." },
          { status: 400 },
        );
      }
      procedimentos.push({ id_procedimento: ip, valor_aplicado: Math.round(va * 100) / 100 });
    }
  }

  if (new Set(procedimentos.map((p) => p.id_procedimento)).size !== procedimentos.length) {
    return NextResponse.json({ error: MSG_PROCEDIMENTO_DUPLICADO }, { status: 400 });
  }

  let pagamentos: {
    id_forma_pagamento: number;
    id_maquineta: number | null;
    valor_pago: number;
    status_pagamento: string;
  }[] = [];

  if (body.pagamentos !== undefined && body.pagamentos !== null) {
    if (!Array.isArray(body.pagamentos)) {
      return NextResponse.json({ error: "pagamentos deve ser um array." }, { status: 400 });
    }
    for (const pg of body.pagamentos) {
      if (!pg || typeof pg !== "object") {
        return NextResponse.json({ error: "Pagamento inválido." }, { status: 400 });
      }
      const o = pg as {
        id_forma_pagamento?: unknown;
        id_maquineta?: unknown;
        valor_pago?: unknown;
        status_pagamento?: unknown;
      };
      const ifp = Number(o.id_forma_pagamento);
      const vp = Number(o.valor_pago);
      const st = typeof o.status_pagamento === "string" ? o.status_pagamento : "pendente";
      let im: number | null = null;
      if (o.id_maquineta !== undefined && o.id_maquineta !== null) {
        const n = Number(o.id_maquineta);
        if (!Number.isFinite(n) || n <= 0) {
          return NextResponse.json({ error: "Maquineta inválida." }, { status: 400 });
        }
        im = n;
      }
      if (!Number.isFinite(ifp) || ifp <= 0) {
        return NextResponse.json({ error: "Forma de pagamento inválida." }, { status: 400 });
      }
      if (!Number.isFinite(vp) || vp < 0) {
        return NextResponse.json({ error: "Valor pago inválido." }, { status: 400 });
      }
      if (!isPgStatus(st)) {
        return NextResponse.json({ error: "Status de pagamento inválido." }, { status: 400 });
      }
      pagamentos.push({
        id_forma_pagamento: ifp,
        id_maquineta: im,
        valor_pago: Math.round(vp * 100) / 100,
        status_pagamento: st,
      });
    }
  }

  const [podeVerTodos, somentePropriaColuna] = await Promise.all([
    getPodeVerTodosAgendamentos(supabase, sessionUserId),
    getUsuarioAgendaSomentePropriaColuna(supabase, sessionUserId),
  ]);
  if ((!podeVerTodos || somentePropriaColuna) && idUsuario !== sessionUserId) {
    return NextResponse.json(
      { error: "Sem permissão para criar agendamento de outro profissional." },
      { status: 403 },
    );
  }

  if (somentePropriaColuna) {
    pagamentos = [];
  }

  const { ids: grupoIds } = await resolveGruposCalendario(supabase, empresaId);

  const { data: uRow, error: uErr } = await supabase
    .from("usuarios")
    .select("id, id_empresa, id_grupo_usuarios, ativo, exibir_na_agenda")
    .eq("id", idUsuario)
    .maybeSingle();

  if (uErr) {
    console.error(uErr);
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }
  if (!uRow || (uRow.id_empresa as number) !== empresaId || !uRow.ativo) {
    return NextResponse.json({ error: "Profissional inválido." }, { status: 400 });
  }
  const exibirNaAgenda = Boolean(uRow.exibir_na_agenda);
  if (
    !profissionalPodeNaAgenda(
      grupoIds,
      uRow.id_grupo_usuarios as number,
      exibirNaAgenda,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "O profissional não está habilitado na agenda. Marque \"Exibir na agenda\" no usuário ou ajuste a parametrização dos grupos.",
      },
      { status: 400 },
    );
  }

  const { data: pacRow, error: pacErr } = await supabase
    .from("pacientes")
    .select("id, id_empresa")
    .eq("id", idPaciente)
    .maybeSingle();
  if (pacErr) {
    console.error(pacErr);
    return NextResponse.json({ error: pacErr.message }, { status: 500 });
  }
  if (!pacRow || (pacRow.id_empresa as number) !== empresaId) {
    return NextResponse.json({ error: "Paciente inválido." }, { status: 400 });
  }

  const { data: salaRow, error: salaErr } = await supabase
    .from("salas")
    .select("id, id_empresa")
    .eq("id", idSala)
    .maybeSingle();
  if (salaErr) {
    console.error(salaErr);
    return NextResponse.json({ error: salaErr.message }, { status: 500 });
  }
  if (!salaRow || (salaRow.id_empresa as number) !== empresaId) {
    return NextResponse.json({ error: "Sala inválida." }, { status: 400 });
  }

  const procIds = [...new Set(procedimentos.map((p) => p.id_procedimento))];
  if (procIds.length > 0) {
    const { data: procRows, error: procErr } = await supabase
      .from("procedimentos")
      .select("id, id_empresa")
      .in("id", procIds);
    if (procErr) {
      console.error(procErr);
      return NextResponse.json({ error: procErr.message }, { status: 500 });
    }
    const procOk = new Map((procRows ?? []).map((r) => [r.id as number, r.id_empresa as number]));
    for (const pid of procIds) {
      if (procOk.get(pid) !== empresaId) {
        return NextResponse.json(
          { error: "Procedimento inválido para esta empresa." },
          { status: 400 },
        );
      }
    }

    try {
      const vCol = await validarProcedimentosDoColaborador(
        supabase,
        idUsuario,
        empresaId,
        procIds,
      );
      if (!vCol.ok) {
        return NextResponse.json({ error: vCol.message }, { status: 400 });
      }
    } catch (e) {
      console.error(e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Erro ao validar procedimentos." },
        { status: 500 },
      );
    }
  }

  if (!ignoraValidacaoHorario) {
    try {
      const conflito = await haConflitoAgendaProfissional(supabase, {
        idEmpresa: empresaId,
        idUsuario,
        inicioIso: inicio,
        fimIso: fim,
      });
      if (conflito) {
        return NextResponse.json({ error: MSG_CONFLITO_PROFISSIONAL }, { status: 400 });
      }
    } catch (e) {
      console.error(e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Erro ao validar agenda." },
        { status: 500 },
      );
    }
  }

  if (pagamentos.length > 0) {
    const formas = [...new Set(pagamentos.map((p) => p.id_forma_pagamento))];
    const { data: fRows, error: fErr } = await supabase
      .from("formas_pagamento")
      .select("id")
      .in("id", formas);
    if (fErr) {
      console.error(fErr);
      return NextResponse.json({ error: fErr.message }, { status: 500 });
    }
    if ((fRows ?? []).length !== formas.length) {
      return NextResponse.json({ error: "Forma de pagamento inválida." }, { status: 400 });
    }

    const maqs = pagamentos.map((p) => p.id_maquineta).filter((x): x is number => x !== null);
    if (maqs.length > 0) {
      const um = [...new Set(maqs)];
      const { data: mRows, error: mErr } = await supabase
        .from("maquinetas")
        .select("id, ativo")
        .in("id", um);
      if (mErr) {
        console.error(mErr);
        return NextResponse.json({ error: mErr.message }, { status: 500 });
      }
      for (const id of um) {
        const row = (mRows ?? []).find((r) => (r.id as number) === id);
        if (!row || !row.ativo) {
          return NextResponse.json(
            { error: "Maquineta inválida ou inativa." },
            { status: 400 },
          );
        }
      }
    }
  }

  const valorBruto = Math.round(
    procedimentos.reduce((s, p) => s + p.valor_aplicado, 0) * 100,
  ) / 100;
  const valorTotal = calcularValorTotal(valorBruto, desconto);

  const { data: insAg, error: insErr } = await supabase
    .from("agendamentos")
    .insert({
      id_empresa: empresaId,
      id_usuario: idUsuario,
      id_paciente: idPaciente,
      id_sala: idSala,
      data_hora_inicio: inicio,
      data_hora_fim: fim,
      status: statusStr,
      valor_bruto: valorBruto,
      desconto,
      valor_total: valorTotal,
      observacoes,
    })
    .select("id")
    .single();

  if (insErr || !insAg) {
    console.error(insErr);
    return NextResponse.json({ error: insErr?.message ?? "Erro ao salvar." }, { status: 500 });
  }

  const idAgendamento = insAg.id as number;

  if (procedimentos.length > 0) {
    const { error: apErr } = await supabase.from("agendamento_procedimentos").insert(
      procedimentos.map((p) => ({
        id_agendamento: idAgendamento,
        id_procedimento: p.id_procedimento,
        valor_aplicado: p.valor_aplicado,
      })),
    );

    if (apErr) {
      console.error(apErr);
      await supabase.from("agendamentos").delete().eq("id", idAgendamento);
      if (apErr.code === "23505") {
        return NextResponse.json({ error: MSG_PROCEDIMENTO_DUPLICADO }, { status: 400 });
      }
      return NextResponse.json({ error: apErr.message }, { status: 500 });
    }
  }

  if (pagamentos.length > 0) {
    const { error: pgErr } = await supabase.from("pagamentos").insert(
      pagamentos.map((p) => ({
        id_agendamento: idAgendamento,
        id_forma_pagamento: p.id_forma_pagamento,
        id_maquineta: p.id_maquineta,
        valor_pago: p.valor_pago,
        status_pagamento: p.status_pagamento,
      })),
    );
    if (pgErr) {
      console.error(pgErr);
      await supabase.from("agendamentos").delete().eq("id", idAgendamento);
      return NextResponse.json({ error: pgErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ data: { id: idAgendamento } });
}
