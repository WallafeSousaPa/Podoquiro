import { NextResponse } from "next/server";
import {
  montarLinhasProdutosAgendamentoDoBody,
  type RowAgProdInsert,
} from "@/lib/agenda/agendamento-produtos-body";
import { calcularValorTotal } from "@/lib/agenda/totais";
import { resolveGruposCalendario } from "@/lib/agenda/grupos-calendario";
import {
  getPodeVerTodosAgendamentos,
  getUsuarioPodeAgendarRetroativo,
  getUsuarioAgendaSomentePropriaColuna,
  getNomeGrupoUsuariosDoUsuario,
  grupoNomePermiteProdutosModalCaixaRecepcao,
  grupoNomeVisualizaDescontoProdutoModalCaixa,
  profissionalPodeNaAgenda,
} from "@/lib/agenda/permissoes-calendario";
import { validarProcedimentosDoColaborador } from "@/lib/colaborador-procedimentos";
import {
  MSG_HORARIO_RETROATIVO,
  MSG_PROCEDIMENTO_DUPLICADO,
  haConflitoNasLinhasSobreposicao,
  inicioEhRetroativo,
  listarSobreposicaoAgendaProfissional,
  mensagemConflitoAgendaProfissionalComDetalhe,
  statusAgendaOcupacaoSlot,
  statusAgendamentoIgnoraValidacaoHorario,
} from "@/lib/agenda/validacao-agendamento";
import { dataReferenciaBrasilia } from "@/lib/financeiro/data-referencia-brasilia";
import { obterSituacaoCaixaDia } from "@/lib/financeiro/caixa-situacao-dia";
import { getSession } from "@/lib/auth/session";
import { tentarLogErroApi } from "@/lib/aplicacao/tentar-log-erro-api";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  baixarOuEstornarEstoqueMercadorias,
  deltaVendaEntreMapas,
  somarQtdPorProduto,
} from "@/lib/estoque/agendamento-produtos-estoque";

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

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
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

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const [podeVerTodosGet, somentePropriaColunaGet] = await Promise.all([
    getPodeVerTodosAgendamentos(supabase, sessionUserId),
    getUsuarioAgendaSomentePropriaColuna(supabase, sessionUserId),
  ]);
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
    await tentarLogErroApi(request, supabase, session, {
      origem: `api:agendamentos:GET:${id}`,
      status: 500,
      mensagem: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    await tentarLogErroApi(request, supabase, session, {
      origem: `api:agendamentos:GET:${id}`,
      status: 404,
      mensagem: "Agendamento não encontrado.",
    });
    return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
  }
  if (
    (!podeVerTodosGet || somentePropriaColunaGet) &&
    (row.id_usuario as number) !== sessionUserId
  ) {
    await tentarLogErroApi(request, supabase, session, {
      origem: `api:agendamentos:GET:${id}`,
      status: 403,
      mensagem: "Não autorizado.",
      idPaciente: row.id_paciente as number,
    });
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  const { data: procs } = await supabase
    .from("agendamento_procedimentos")
    .select("id, id_procedimento, valor_aplicado")
    .eq("id_agendamento", id);

  const { data: aprods } = await supabase
    .from("agendamento_produtos")
    .select(
      "id, id_produto, qtd, valor_desconto, valor_produto, valor_final, produtos ( produto )",
    )
    .eq("id_agendamento", id);

  const nomeGrupoSessao = await getNomeGrupoUsuariosDoUsuario(supabase, sessionUserId);
  const mostrar_desconto_produtos_modal_caixa =
    grupoNomeVisualizaDescontoProdutoModalCaixa(nomeGrupoSessao);
  const permite_editar_produtos_modal_caixa =
    mostrar_desconto_produtos_modal_caixa ||
    grupoNomePermiteProdutosModalCaixaRecepcao(nomeGrupoSessao);

  const pagamentos_nao_carregados_por_perfil =
    somentePropriaColunaGet && !permite_editar_produtos_modal_caixa;

  let pagamentosRes: {
    id: number;
    id_forma_pagamento: number;
    id_maquineta: number | null;
    valor_pago: number;
    status_pagamento: string;
  }[] = [];

  if (!pagamentos_nao_carregados_por_perfil) {
    const { data: pags } = await supabase
      .from("pagamentos")
      .select(
        "id, id_forma_pagamento, id_maquineta, valor_pago, status_pagamento",
      )
      .eq("id_agendamento", id);
    pagamentosRes = (pags ?? []).map((p) => ({
      id: p.id as number,
      id_forma_pagamento: p.id_forma_pagamento as number,
      id_maquineta: p.id_maquineta as number | null,
      valor_pago: Number(p.valor_pago),
      status_pagamento: p.status_pagamento as string,
    }));
  }

  const idUsuarioAg = row.id_usuario as number;
  const podeEditarProcPag =
    !somentePropriaColunaGet &&
    (podeVerTodosGet || idUsuarioAg === sessionUserId);

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
      produtos: (aprods ?? []).map((r) => {
        const pr = r.produtos as { produto?: string } | { produto?: string }[] | null;
        const p0 = Array.isArray(pr) ? pr[0] : pr;
        return {
          id: r.id,
          id_produto: String(r.id_produto),
          nome_produto: p0?.produto?.trim() ?? null,
          qtd: Number(r.qtd),
          valor_desconto: Number(r.valor_desconto),
          valor_produto: Number(r.valor_produto),
          valor_final: Number(r.valor_final),
        };
      }),
      pagamentos: pagamentosRes,
      permite_editar_procedimentos_e_pagamentos: podeEditarProcPag,
      pagamentos_nao_carregados_por_perfil,
      mostrar_desconto_produtos_modal_caixa,
      permite_editar_produtos_modal_caixa,
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

  const sessionUserId = Number(session.sub);
  if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
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

  const [podeVerTodos, somentePropriaColuna] = await Promise.all([
    getPodeVerTodosAgendamentos(supabase, sessionUserId),
    getUsuarioAgendaSomentePropriaColuna(supabase, sessionUserId),
  ]);
  if (
    (!podeVerTodos || somentePropriaColuna) &&
    (existente.id_usuario as number) !== sessionUserId
  ) {
    return NextResponse.json(
      { error: "Sem permissão para alterar este agendamento." },
      { status: 403 },
    );
  }

  const nomeGrupoUsuarioPatch = await getNomeGrupoUsuariosDoUsuario(
    supabase,
    sessionUserId,
  );
  const usuarioFluxoCaixaProdutosOuAdmin =
    grupoNomeVisualizaDescontoProdutoModalCaixa(nomeGrupoUsuarioPatch) ||
    grupoNomePermiteProdutosModalCaixaRecepcao(nomeGrupoUsuarioPatch);

  if (somentePropriaColuna) {
    const chaves = Object.keys(body);
    const apenasStatus =
      chaves.length === 0 ||
      (chaves.length === 1 && chaves[0] === "status");
    const apenasProdutosOpcionalPagamentos =
      usuarioFluxoCaixaProdutosOuAdmin &&
      chaves.length > 0 &&
      chaves.every((k) => k === "produtos" || k === "pagamentos") &&
      Object.prototype.hasOwnProperty.call(body, "produtos");

    if (!apenasStatus && !apenasProdutosOpcionalPagamentos) {
      return NextResponse.json(
        {
          error:
            "Seu perfil só pode alterar o status (ex.: Pendente ou Confirmado → Em andamento).",
        },
        { status: 403 },
      );
    }
    if (apenasStatus && typeof body.status === "string") {
      const atual = String(existente.status);
      const novo = body.status;
      const transicaoPermitidaPodologo =
        (atual === "pendente" && novo === "em_andamento") ||
        (atual === "pendente" && novo === "confirmado") ||
        (atual === "confirmado" && novo === "em_andamento") ||
        (novo === "faltou" &&
          (atual === "pendente" ||
            atual === "confirmado" ||
            atual === "em_andamento"));
      if (novo !== atual && !transicaoPermitidaPodologo) {
        return NextResponse.json(
          {
            error:
              "Apenas é permitido: Pendente → Confirmado, Pendente → Em andamento ou Confirmado → Em andamento.",
          },
          { status: 403 },
        );
      }
    }
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.id_usuario !== "undefined") {
    const idUsuario = Number(body.id_usuario);
    if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
      return NextResponse.json({ error: "Profissional inválido." }, { status: 400 });
    }
    if ((!podeVerTodos || somentePropriaColuna) && idUsuario !== sessionUserId) {
      return NextResponse.json(
        { error: "Sem permissão para transferir o agendamento a outro profissional." },
        { status: 403 },
      );
    }
    const { ids: grupoIds } = await resolveGruposCalendario(supabase, empresaId);
    const { data: uRow, error: uErr } = await supabase
      .from("usuarios")
      .select("id_empresa, id_grupo_usuarios, ativo, exibir_na_agenda")
      .eq("id", idUsuario)
      .maybeSingle();
    if (uErr) {
      console.error(uErr);
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }
    if (!uRow || (uRow.id_empresa as number) !== empresaId || !uRow.ativo) {
      return NextResponse.json({ error: "Profissional inválido." }, { status: 400 });
    }
    if (
      !profissionalPodeNaAgenda(
        grupoIds,
        uRow.id_grupo_usuarios as number,
        Boolean(uRow.exibir_na_agenda),
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

  const statusParaValidacaoHorario =
    typeof body.status === "string" && isAgStatus(body.status)
      ? body.status
      : String(existente.status);
  const ignoraValidacaoHorario =
    statusAgendamentoIgnoraValidacaoHorario(statusParaValidacaoHorario);

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
  if (ignoraValidacaoHorario) {
    if (Number.isNaN(t0.getTime()) || Number.isNaN(t1.getTime()) || t1 <= t0) {
      const base = !Number.isNaN(t0.getTime())
        ? t0
        : new Date(String(existente.data_hora_inicio));
      if (Number.isNaN(base.getTime())) {
        return NextResponse.json(
          { error: "Intervalo de data/hora inválido." },
          { status: 400 },
        );
      }
      const fimAjustado = new Date(base.getTime() + 60_000);
      inicio = base.toISOString();
      fim = fimAjustado.toISOString();
      patch.data_hora_inicio = inicio;
      patch.data_hora_fim = fim;
    }
  } else if (Number.isNaN(t0.getTime()) || Number.isNaN(t1.getTime()) || t1 <= t0) {
    return NextResponse.json(
      { error: "Intervalo de data/hora inválido." },
      { status: 400 },
    );
  }

  const t0ParaRetroativo = new Date(inicio);

  const podeAgendarRetroativo = await getUsuarioPodeAgendarRetroativo(
    supabase,
    sessionUserId,
  );
  const exIni = String(existente.data_hora_inicio);
  const inicioMudou =
    typeof body.data_hora_inicio === "string" && body.data_hora_inicio !== exIni;
  if (
    !ignoraValidacaoHorario &&
    inicioMudou &&
    !podeAgendarRetroativo &&
    inicioEhRetroativo(t0ParaRetroativo)
  ) {
    return NextResponse.json({ error: MSG_HORARIO_RETROATIVO }, { status: 400 });
  }

  const idUsuarioFinal = (typeof patch.id_usuario !== "undefined"
    ? patch.id_usuario
    : existente.id_usuario) as number;

  let idsProcColaborador: number[] = [];
  if (Object.prototype.hasOwnProperty.call(body, "procedimentos")) {
    const arr = body.procedimentos;
    if (Array.isArray(arr) && arr.length > 0) {
      for (const p of arr) {
        if (!p || typeof p !== "object") continue;
        const ip = Number((p as { id_procedimento?: unknown }).id_procedimento);
        if (Number.isFinite(ip) && ip > 0) idsProcColaborador.push(ip);
      }
      idsProcColaborador = [...new Set(idsProcColaborador)];
    }
  } else {
    const { data: apRows, error: apErr } = await supabase
      .from("agendamento_procedimentos")
      .select("id_procedimento")
      .eq("id_agendamento", id);
    if (apErr) {
      console.error(apErr);
      return NextResponse.json({ error: apErr.message }, { status: 500 });
    }
    idsProcColaborador = (apRows ?? []).map((r) => r.id_procedimento as number);
  }

  if (idsProcColaborador.length > 0) {
    try {
      const vCol = await validarProcedimentosDoColaborador(
        supabase,
        idUsuarioFinal,
        empresaId,
        idsProcColaborador,
      );
      if (!vCol.ok) {
        return NextResponse.json({ error: vCol.message }, { status: 400 });
      }
    } catch (e) {
      console.error(e);
      return NextResponse.json(
        {
          error:
            e instanceof Error ? e.message : "Erro ao validar procedimentos.",
        },
        { status: 500 },
      );
    }
  }

  if (!ignoraValidacaoHorario) {
    try {
      const linhasSobreposicao = await listarSobreposicaoAgendaProfissional(supabase, {
        idEmpresa: empresaId,
        idUsuario: idUsuarioFinal,
        inicioIso: inicio,
        fimIso: fim,
        ignorarAgendamentoId: id,
      });
      if (haConflitoNasLinhasSobreposicao(linhasSobreposicao)) {
        const debugAgenda =
          process.env.NODE_ENV !== "production"
            ? {
                consulta: {
                  idEmpresa: empresaId,
                  idUsuario: idUsuarioFinal,
                  inicioIso: inicio,
                  fimIso: fim,
                  ignorarAgendamentoId: id,
                },
                linhasSobrepostas: linhasSobreposicao.map((row) => ({
                  ...row,
                  bloqueiaSlot: statusAgendaOcupacaoSlot(row.status),
                })),
              }
            : undefined;
        return NextResponse.json(
          {
            error: mensagemConflitoAgendaProfissionalComDetalhe(linhasSobreposicao),
            ...(debugAgenda ? { debugAgenda } : {}),
          },
          { status: 400 },
        );
      }
    } catch (e) {
      console.error(e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Erro ao validar agenda." },
        { status: 500 },
      );
    }
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
    const nomeGDesconto = await getNomeGrupoUsuariosDoUsuario(supabase, sessionUserId);
    if (!grupoNomeVisualizaDescontoProdutoModalCaixa(nomeGDesconto)) {
      return NextResponse.json(
        { error: "Sem permissão para alterar o desconto do agendamento." },
        { status: 403 },
      );
    }
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
  const trocaProdutosRecepcao =
    Object.prototype.hasOwnProperty.call(body, "produtos") &&
    !Object.prototype.hasOwnProperty.call(body, "procedimentos");
  if (trocaProcedimentos) {
    const arr = body.procedimentos;
    if (!Array.isArray(arr) || arr.length === 0) {
      return NextResponse.json(
        { error: "Informe ao menos um procedimento." },
        { status: 400 },
      );
    }
    const nomeGrupoPatch = await getNomeGrupoUsuariosDoUsuario(supabase, sessionUserId);
    if (!grupoNomeVisualizaDescontoProdutoModalCaixa(nomeGrupoPatch)) {
      return NextResponse.json(
        {
          error:
            "Sem permissão para alterar a lista de procedimentos. Use um usuário Administrador ou Administrativo.",
        },
        { status: 403 },
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

    const somaProc =
      Math.round(procedimentos.reduce((s, p) => s + p.valor_aplicado, 0) * 100) / 100;

    if (!Array.isArray(body.produtos)) {
      return NextResponse.json(
        {
          error:
            "Informe a lista `produtos` junto com `procedimentos` (use `[]` se não houver mercadorias).",
        },
        { status: 400 },
      );
    }

    const montadosProc = await montarLinhasProdutosAgendamentoDoBody(
      supabase,
      empresaId,
      id,
      body.produtos,
      { forcarValorDescontoZero: false },
    );
    if (!montadosProc.ok) {
      if (montadosProc.status >= 500) {
        await tentarLogErroApi(request, supabase, session, {
          origem: `api:agendamentos:PATCH:${id}:montar_produtos_admin`,
          status: montadosProc.status,
          mensagem: montadosProc.error,
          idPaciente: existente.id_paciente as number,
        });
      }
      return NextResponse.json(
        { error: montadosProc.error },
        { status: montadosProc.status },
      );
    }
    const produtosInsert: RowAgProdInsert[] = montadosProc.produtosInsert;
    const somaProd = montadosProc.somaProd;
    valorBruto = Math.round((somaProc + somaProd) * 100) / 100;
    patch.valor_bruto = valorBruto;

    const { data: oldAprodsRows, error: oldApErr } = await supabase
      .from("agendamento_produtos")
      .select("id_produto, qtd")
      .eq("id_agendamento", id);
    if (oldApErr) {
      console.error(oldApErr);
      return NextResponse.json({ error: oldApErr.message }, { status: 500 });
    }

    const { error: delAgPr } = await supabase
      .from("agendamento_produtos")
      .delete()
      .eq("id_agendamento", id);
    if (delAgPr) {
      console.error(delAgPr);
      return NextResponse.json({ error: delAgPr.message }, { status: 500 });
    }

    if (produtosInsert.length > 0) {
      const { error: insAgPr } = await supabase.from("agendamento_produtos").insert(
        produtosInsert.map((r) => ({
          id_agendamento: r.id_agendamento,
          id_produto: r.id_produto,
          qtd: r.qtd,
          valor_desconto: r.valor_desconto,
          valor_produto: r.valor_produto,
          valor_final: r.valor_final,
        })),
      );
      if (insAgPr) {
        console.error(insAgPr);
        return NextResponse.json({ error: insAgPr.message }, { status: 500 });
      }
    }

    const statusParaEstoque =
      typeof patch.status === "string"
        ? String(patch.status)
        : String(existente.status);
    if (statusParaEstoque === "realizado") {
      const oldMap = somarQtdPorProduto(oldAprodsRows ?? []);
      const newMap = somarQtdPorProduto(
        produtosInsert.map((r) => ({ id_produto: r.id_produto, qtd: r.qtd })),
      );
      const delta = deltaVendaEntreMapas(oldMap, newMap);
      const est = await baixarOuEstornarEstoqueMercadorias(supabase, empresaId, delta);
      if (!est.ok) {
        return NextResponse.json(
          { error: `Não foi possível atualizar o estoque: ${est.message}` },
          { status: 500 },
        );
      }
    }

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

  if (trocaProdutosRecepcao) {
    const nomeGR = await getNomeGrupoUsuariosDoUsuario(supabase, sessionUserId);
    if (!grupoNomePermiteProdutosModalCaixaRecepcao(nomeGR)) {
      await tentarLogErroApi(request, supabase, session, {
        origem: `api:agendamentos:PATCH:${id}:produtos_sem_procedimento`,
        status: 403,
        mensagem: "Sem permissão para alterar apenas mercadorias.",
        detalhe: { grupo: nomeGR },
        idPaciente: existente.id_paciente as number,
      });
      return NextResponse.json(
        {
          error:
            "Sem permissão para alterar apenas mercadorias. Use o perfil Recepção ou envie procedimentos (Administrador/Administrativo).",
        },
        { status: 403 },
      );
    }

    const { data: procLinhasPR, error: errPR } = await supabase
      .from("agendamento_procedimentos")
      .select("valor_aplicado")
      .eq("id_agendamento", id);
    if (errPR) {
      console.error(errPR);
      await tentarLogErroApi(request, supabase, session, {
        origem: `api:agendamentos:PATCH:${id}:load_proc_recepcao`,
        status: 500,
        mensagem: errPR.message,
        idPaciente: existente.id_paciente as number,
      });
      return NextResponse.json({ error: errPR.message }, { status: 500 });
    }
    const somaProcPR =
      Math.round(
        (procLinhasPR ?? []).reduce((s, r) => s + Number(r.valor_aplicado), 0) * 100,
      ) / 100;

    const montPR = await montarLinhasProdutosAgendamentoDoBody(
      supabase,
      empresaId,
      id,
      body.produtos,
      { forcarValorDescontoZero: true },
    );
    if (!montPR.ok) {
      if (montPR.status >= 500) {
        await tentarLogErroApi(request, supabase, session, {
          origem: `api:agendamentos:PATCH:${id}:montar_produtos_recepcao`,
          status: montPR.status,
          mensagem: montPR.error,
          idPaciente: existente.id_paciente as number,
        });
      }
      return NextResponse.json({ error: montPR.error }, { status: montPR.status });
    }

    const produtosInsertPR = montPR.produtosInsert;
    const somaProdPR = montPR.somaProd;
    valorBruto = Math.round((somaProcPR + somaProdPR) * 100) / 100;
    patch.valor_bruto = valorBruto;

    const { data: oldAprodsRowsPR, error: oldApErrPR } = await supabase
      .from("agendamento_produtos")
      .select("id_produto, qtd")
      .eq("id_agendamento", id);
    if (oldApErrPR) {
      console.error(oldApErrPR);
      await tentarLogErroApi(request, supabase, session, {
        origem: `api:agendamentos:PATCH:${id}:old_ag_prod_recepcao`,
        status: 500,
        mensagem: oldApErrPR.message,
        idPaciente: existente.id_paciente as number,
      });
      return NextResponse.json({ error: oldApErrPR.message }, { status: 500 });
    }

    const { error: delAgPrPR } = await supabase
      .from("agendamento_produtos")
      .delete()
      .eq("id_agendamento", id);
    if (delAgPrPR) {
      console.error(delAgPrPR);
      await tentarLogErroApi(request, supabase, session, {
        origem: `api:agendamentos:PATCH:${id}:del_ag_prod_recepcao`,
        status: 500,
        mensagem: delAgPrPR.message,
        idPaciente: existente.id_paciente as number,
      });
      return NextResponse.json({ error: delAgPrPR.message }, { status: 500 });
    }

    if (produtosInsertPR.length > 0) {
      const { error: insAgPrPR } = await supabase.from("agendamento_produtos").insert(
        produtosInsertPR.map((r) => ({
          id_agendamento: r.id_agendamento,
          id_produto: r.id_produto,
          qtd: r.qtd,
          valor_desconto: r.valor_desconto,
          valor_produto: r.valor_produto,
          valor_final: r.valor_final,
        })),
      );
      if (insAgPrPR) {
        console.error(insAgPrPR);
        await tentarLogErroApi(request, supabase, session, {
          origem: `api:agendamentos:PATCH:${id}:ins_ag_prod_recepcao`,
          status: 500,
          mensagem: insAgPrPR.message,
          idPaciente: existente.id_paciente as number,
        });
        return NextResponse.json({ error: insAgPrPR.message }, { status: 500 });
      }
    }

    const statusParaEstoquePR =
      typeof patch.status === "string"
        ? String(patch.status)
        : String(existente.status);
    if (statusParaEstoquePR === "realizado") {
      const oldMapPR = somarQtdPorProduto(oldAprodsRowsPR ?? []);
      const newMapPR = somarQtdPorProduto(
        produtosInsertPR.map((r) => ({ id_produto: r.id_produto, qtd: r.qtd })),
      );
      const deltaPR = deltaVendaEntreMapas(oldMapPR, newMapPR);
      const estPR = await baixarOuEstornarEstoqueMercadorias(supabase, empresaId, deltaPR);
      if (!estPR.ok) {
        await tentarLogErroApi(request, supabase, session, {
          origem: `api:agendamentos:PATCH:${id}:estoque_recepcao`,
          status: 500,
          mensagem: estPR.message,
          idPaciente: existente.id_paciente as number,
        });
        return NextResponse.json(
          { error: `Não foi possível atualizar o estoque: ${estPR.message}` },
          { status: 500 },
        );
      }
    }
  }

  if (trocaProcedimentos || typeof body.desconto !== "undefined" || trocaProdutosRecepcao) {
    patch.valor_total = calcularValorTotal(valorBruto, desconto);
  }

  const trocaPagamentos =
    Object.prototype.hasOwnProperty.call(body, "pagamentos") &&
    (!somentePropriaColuna || usuarioFluxoCaixaProdutosOuAdmin);
  if (trocaPagamentos) {
    if (String(existente.status) !== "realizado") {
      return NextResponse.json(
        {
          error:
            "Só é possível alterar pagamentos com o agendamento concluído (status Realizado).",
        },
        { status: 400 },
      );
    }

    const dataRefCaixa = dataReferenciaBrasilia(String(existente.data_hora_inicio));
    if (!dataRefCaixa) {
      return NextResponse.json(
        { error: "Data de início do agendamento inválida." },
        { status: 400 },
      );
    }
    let situacaoCaixa;
    try {
      situacaoCaixa = await obterSituacaoCaixaDia(supabase, empresaId, dataRefCaixa);
    } catch (e) {
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : "Erro ao verificar o caixa.",
        },
        { status: 500 },
      );
    }
    if (situacaoCaixa.tem_fechamento) {
      const resp = situacaoCaixa.nome_responsavel_fechamento;
      return NextResponse.json(
        {
          error: resp
            ? `O caixa do dia já está fechado. Não é possível registrar pagamentos. Contate ${resp} ou o responsável pelo caixa.`
            : "O caixa do dia já está fechado. Não é possível registrar pagamentos. Contate o responsável pelo caixa.",
        },
        { status: 400 },
      );
    }
    if (!situacaoCaixa.tem_abertura) {
      return NextResponse.json(
        {
          error:
            "Abra o caixa do dia em Financeiro → Caixa antes de registrar pagamentos.",
        },
        { status: 400 },
      );
    }

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

    const valorTotalEsperado = calcularValorTotal(valorBruto, desconto);
    const somaPagamentos =
      Math.round(pagamentos.reduce((s, p) => s + p.valor_pago, 0) * 100) / 100;
    if (Math.abs(somaPagamentos - valorTotalEsperado) > 0.02) {
      return NextResponse.json(
        {
          error: `A soma dos pagamentos (${somaPagamentos.toFixed(2).replace(".", ",")}) deve ser igual ao total do agendamento (${valorTotalEsperado.toFixed(2).replace(".", ",")}), com base na soma dos procedimentos e produtos${desconto > 0 ? ` e no desconto de ${desconto}%` : ""}.`,
        },
        { status: 400 },
      );
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

  const statusNovoPatch =
    typeof patch.status === "string" ? String(patch.status) : String(existente.status);
  const statusAntigoAg = String(existente.status);
  if (
    !trocaProcedimentos &&
    statusNovoPatch === "realizado" &&
    statusAntigoAg !== "realizado"
  ) {
    const { data: apLinhas, error: apStockErr } = await supabase
      .from("agendamento_produtos")
      .select("id_produto, qtd")
      .eq("id_agendamento", id);
    if (apStockErr) {
      console.error(apStockErr);
      return NextResponse.json({ error: apStockErr.message }, { status: 500 });
    }
    const map = somarQtdPorProduto(apLinhas ?? []);
    if (map.size > 0) {
      const est = await baixarOuEstornarEstoqueMercadorias(supabase, empresaId, map);
      if (!est.ok) {
        return NextResponse.json(
          { error: `Não foi possível atualizar o estoque: ${est.message}` },
          { status: 500 },
        );
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
