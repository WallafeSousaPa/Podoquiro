import { NextResponse } from "next/server";
import { calcularValorTotal } from "@/lib/agenda/totais";
import { resolveGruposCalendario } from "@/lib/agenda/grupos-calendario";
import {
  MSG_CONFLITO_PROFISSIONAL,
  MSG_HORARIO_RETROATIVO,
  MSG_PROCEDIMENTO_DUPLICADO,
  haConflitoAgendaProfissional,
  inicioEhRetroativo,
} from "@/lib/agenda/validacao-agendamento";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const AGENDAMENTO_STATUS = [
  "pendente",
  "em_andamento",
  "realizado",
  "cancelado",
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

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from("agendamentos")
    .select(
      "id, id_usuario, id_paciente, id_sala, data_hora_inicio, data_hora_fim, status, valor_bruto, desconto, valor_total, observacoes",
    )
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
  }

  const { data: procs } = await supabase
    .from("agendamento_procedimentos")
    .select("id, id_procedimento, valor_aplicado")
    .eq("id_agendamento", id);

  const { data: pags } = await supabase
    .from("pagamentos")
    .select(
      "id, id_forma_pagamento, id_maquineta, valor_pago, status_pagamento",
    )
    .eq("id_agendamento", id);

  return NextResponse.json({
    data: {
      ...row,
      valor_bruto: Number(row.valor_bruto),
      desconto: Number(row.desconto),
      valor_total: Number(row.valor_total),
      procedimentos: (procs ?? []).map((p) => ({
        id: p.id,
        id_procedimento: p.id_procedimento,
        valor_aplicado: Number(p.valor_aplicado),
      })),
      pagamentos: (pags ?? []).map((p) => ({
        id: p.id,
        id_forma_pagamento: p.id_forma_pagamento,
        id_maquineta: p.id_maquineta,
        valor_pago: Number(p.valor_pago),
        status_pagamento: p.status_pagamento,
      })),
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existente, error: exErr } = await supabase
    .from("agendamentos")
    .select(
      "id, id_usuario, id_paciente, id_sala, data_hora_inicio, data_hora_fim, status, valor_bruto, desconto, valor_total, observacoes",
    )
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (exErr) {
    console.error(exErr);
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }
  if (!existente) {
    return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.id_usuario !== "undefined") {
    const idUsuario = Number(body.id_usuario);
    if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
      return NextResponse.json({ error: "Profissional inválido." }, { status: 400 });
    }
    const { ids: grupoIds } = await resolveGruposCalendario(supabase, empresaId);
    if (grupoIds.length === 0) {
      return NextResponse.json(
        { error: "Nenhum grupo disponível para a agenda." },
        { status: 400 },
      );
    }
    const { data: uRow, error: uErr } = await supabase
      .from("usuarios")
      .select("id_empresa, id_grupo_usuarios, ativo")
      .eq("id", idUsuario)
      .maybeSingle();
    if (uErr) {
      console.error(uErr);
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }
    if (!uRow || (uRow.id_empresa as number) !== empresaId || !uRow.ativo) {
      return NextResponse.json({ error: "Profissional inválido." }, { status: 400 });
    }
    if (!grupoIds.includes(uRow.id_grupo_usuarios as number)) {
      return NextResponse.json(
        {
          error:
            "O profissional não pertence aos grupos exibidos na agenda.",
        },
        { status: 400 },
      );
    }
    patch.id_usuario = idUsuario;
  }

  if (typeof body.id_paciente !== "undefined") {
    const idPaciente = Number(body.id_paciente);
    if (!Number.isFinite(idPaciente) || idPaciente <= 0) {
      return NextResponse.json({ error: "Paciente inválido." }, { status: 400 });
    }
    const { data: pacRow, error: pacErr } = await supabase
      .from("pacientes")
      .select("id_empresa")
      .eq("id", idPaciente)
      .maybeSingle();
    if (pacErr) {
      console.error(pacErr);
      return NextResponse.json({ error: pacErr.message }, { status: 500 });
    }
    if (!pacRow || (pacRow.id_empresa as number) !== empresaId) {
      return NextResponse.json({ error: "Paciente inválido." }, { status: 400 });
    }
    patch.id_paciente = idPaciente;
  }

  if (typeof body.id_sala !== "undefined") {
    const idSala = Number(body.id_sala);
    if (!Number.isFinite(idSala) || idSala <= 0) {
      return NextResponse.json({ error: "Sala inválida." }, { status: 400 });
    }
    const { data: salaRow, error: salaErr } = await supabase
      .from("salas")
      .select("id_empresa")
      .eq("id", idSala)
      .maybeSingle();
    if (salaErr) {
      console.error(salaErr);
      return NextResponse.json({ error: salaErr.message }, { status: 500 });
    }
    if (!salaRow || (salaRow.id_empresa as number) !== empresaId) {
      return NextResponse.json({ error: "Sala inválida." }, { status: 400 });
    }
    patch.id_sala = idSala;
  }

  let inicio = existente.data_hora_inicio as string;
  let fim = existente.data_hora_fim as string;
  if (typeof body.data_hora_inicio === "string") {
    inicio = body.data_hora_inicio;
    patch.data_hora_inicio = inicio;
  }
  if (typeof body.data_hora_fim === "string") {
    fim = body.data_hora_fim;
    patch.data_hora_fim = fim;
  }
  const t0 = new Date(inicio);
  const t1 = new Date(fim);
  if (Number.isNaN(t0.getTime()) || Number.isNaN(t1.getTime()) || t1 <= t0) {
    return NextResponse.json(
      { error: "Intervalo de data/hora inválido." },
      { status: 400 },
    );
  }

  const exIni = String(existente.data_hora_inicio);
  const inicioMudou =
    typeof body.data_hora_inicio === "string" && body.data_hora_inicio !== exIni;
  if (inicioMudou && inicioEhRetroativo(t0)) {
    return NextResponse.json({ error: MSG_HORARIO_RETROATIVO }, { status: 400 });
  }

  const idUsuarioFinal = (typeof patch.id_usuario !== "undefined"
    ? patch.id_usuario
    : existente.id_usuario) as number;

  try {
    const conflito = await haConflitoAgendaProfissional(supabase, {
      idEmpresa: empresaId,
      idUsuario: idUsuarioFinal,
      inicioIso: inicio,
      fimIso: fim,
      ignorarAgendamentoId: id,
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

  if (typeof body.status === "string") {
    if (!isAgStatus(body.status)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    patch.status = body.status;
  }

  if (typeof body.observacoes !== "undefined") {
    patch.observacoes =
      body.observacoes === null
        ? null
        : typeof body.observacoes === "string"
          ? body.observacoes.trim() || null
          : null;
  }

  let desconto = Number(existente.desconto);
  if (typeof body.desconto !== "undefined" && body.desconto !== null) {
    desconto = Number(body.desconto);
    if (!Number.isFinite(desconto) || desconto < 0 || desconto > 100) {
      return NextResponse.json(
        { error: "Desconto deve ser entre 0 e 100%." },
        { status: 400 },
      );
    }
    patch.desconto = desconto;
  }

  let valorBruto = Number(existente.valor_bruto);

  const trocaProcedimentos = Object.prototype.hasOwnProperty.call(body, "procedimentos");
  if (trocaProcedimentos) {
    const arr = body.procedimentos;
    if (!Array.isArray(arr) || arr.length === 0) {
      return NextResponse.json(
        { error: "Informe ao menos um procedimento." },
        { status: 400 },
      );
    }
    const procedimentos: { id_procedimento: number; valor_aplicado: number }[] = [];
    for (const p of arr) {
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
        return NextResponse.json({ error: "Valor aplicado inválido." }, { status: 400 });
      }
      procedimentos.push({ id_procedimento: ip, valor_aplicado: Math.round(va * 100) / 100 });
    }

    if (new Set(procedimentos.map((p) => p.id_procedimento)).size !== procedimentos.length) {
      return NextResponse.json({ error: MSG_PROCEDIMENTO_DUPLICADO }, { status: 400 });
    }

    const procIds = [...new Set(procedimentos.map((p) => p.id_procedimento))];
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

    valorBruto =
      Math.round(procedimentos.reduce((s, p) => s + p.valor_aplicado, 0) * 100) / 100;
    patch.valor_bruto = valorBruto;

    const { error: delP } = await supabase
      .from("agendamento_procedimentos")
      .delete()
      .eq("id_agendamento", id);
    if (delP) {
      console.error(delP);
      return NextResponse.json({ error: delP.message }, { status: 500 });
    }

    const { error: insP } = await supabase.from("agendamento_procedimentos").insert(
      procedimentos.map((p) => ({
        id_agendamento: id,
        id_procedimento: p.id_procedimento,
        valor_aplicado: p.valor_aplicado,
      })),
    );
    if (insP) {
      console.error(insP);
      if (insP.code === "23505") {
        return NextResponse.json({ error: MSG_PROCEDIMENTO_DUPLICADO }, { status: 400 });
      }
      return NextResponse.json({ error: insP.message }, { status: 500 });
    }
  }

  if (trocaProcedimentos || typeof body.desconto !== "undefined") {
    patch.valor_total = calcularValorTotal(valorBruto, desconto);
  }

  const trocaPagamentos = Object.prototype.hasOwnProperty.call(body, "pagamentos");
  if (trocaPagamentos) {
    const arr = body.pagamentos;
    if (!Array.isArray(arr)) {
      return NextResponse.json({ error: "pagamentos deve ser um array." }, { status: 400 });
    }
    const pagamentos: {
      id_forma_pagamento: number;
      id_maquineta: number | null;
      valor_pago: number;
      status_pagamento: string;
    }[] = [];

    for (const pg of arr) {
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
        for (const mid of um) {
          const row = (mRows ?? []).find((r) => (r.id as number) === mid);
          if (!row || !row.ativo) {
            return NextResponse.json(
              { error: "Maquineta inválida ou inativa." },
              { status: 400 },
            );
          }
        }
      }
    }

    const { error: delPg } = await supabase.from("pagamentos").delete().eq("id_agendamento", id);
    if (delPg) {
      console.error(delPg);
      return NextResponse.json({ error: delPg.message }, { status: 500 });
    }

    if (pagamentos.length > 0) {
      const { error: insPg } = await supabase.from("pagamentos").insert(
        pagamentos.map((p) => ({
          id_agendamento: id,
          id_forma_pagamento: p.id_forma_pagamento,
          id_maquineta: p.id_maquineta,
          valor_pago: p.valor_pago,
          status_pagamento: p.status_pagamento,
        })),
      );
      if (insPg) {
        console.error(insPg);
        return NextResponse.json({ error: insPg.message }, { status: 500 });
      }
    }
  }

  if (Object.keys(patch).length > 0) {
    const { error: upErr } = await supabase.from("agendamentos").update(patch).eq("id", id);
    if (upErr) {
      console.error(upErr);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
