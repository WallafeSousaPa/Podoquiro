import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  avisoFusoHorarioEmissaoNfse,
  dataEmissaoRpsBrasilAbrasf,
  dataHojeBrasilIso,
  formatCnaeExibicao,
  formatCodigoLc116Exibicao,
  normalizarCompetenciaNfse,
  notaasEmitir,
  NotaasApiError,
  normalizarCodigoServicoLc116,
  normalizarCnae,
  obterApiKeyNotaas,
  obterConfigEmissaoNotaas,
  statusNotaasParaInterno,
  type NotaasEmitirBody,
} from "@/lib/notaas";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function apenasDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function nomePaciente(p: {
  nome_completo: string | null;
  nome_social: string | null;
}): string {
  const nc = p.nome_completo?.trim();
  const ns = p.nome_social?.trim();
  return nc || ns || "Tomador";
}

type BodyEmitir = {
  id_paciente?: number;
  id_produto?: string;
  descricao?: string;
  valor_total?: number;
  aliquota_iss?: number;
  codigo_servico?: string;
  cnae?: string;
  iss_retido?: boolean;
  competencia?: string;
};

/** Enfileira NFS-e na Notaas e grava registro local. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let body: BodyEmitir;
  try {
    body = (await request.json()) as BodyEmitir;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const idPaciente = body.id_paciente;
  if (!idPaciente || !Number.isFinite(idPaciente)) {
    return NextResponse.json({ error: "Informe o paciente (tomador)." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const avisoFuso = avisoFusoHorarioEmissaoNfse();
  if (avisoFuso.bloqueada) {
    return NextResponse.json({ error: avisoFuso.mensagem }, { status: 422 });
  }

  const { data: paciente, error: pacErr } = await supabase
    .from("pacientes")
    .select(
      "id, cpf, nome_completo, nome_social, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf",
    )
    .eq("id", idPaciente)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (pacErr) {
    return NextResponse.json({ error: pacErr.message }, { status: 500 });
  }
  if (!paciente) {
    return NextResponse.json({ error: "Paciente não encontrado." }, { status: 404 });
  }

  const cpf = apenasDigitos(paciente.cpf ?? "");
  if (cpf.length !== 11) {
    return NextResponse.json({ error: "CPF do paciente inválido para NFS-e." }, { status: 400 });
  }

  let descricao = body.descricao?.trim() ?? "";
  let valorTotal = body.valor_total != null ? Number(body.valor_total) : NaN;
  let idProduto: string | null = body.id_produto?.trim() || null;

  if (idProduto) {
    const { data: prod, error: prodErr } = await supabase
      .from("produtos")
      .select("id, produto, preco, preco_venda, servico, ativo")
      .eq("id", idProduto)
      .eq("id_empresa", empresaId)
      .maybeSingle();

    if (prodErr) {
      return NextResponse.json({ error: prodErr.message }, { status: 500 });
    }
    if (!prod) {
      return NextResponse.json({ error: "Serviço/produto não encontrado." }, { status: 404 });
    }
    if (!prod.servico) {
      return NextResponse.json(
        { error: "Selecione um serviço (não mercadoria) para NFS-e." },
        { status: 400 },
      );
    }
    if (!prod.ativo) {
      return NextResponse.json({ error: "Serviço inativo." }, { status: 400 });
    }
    if (!descricao) descricao = String(prod.produto).trim();
    if (!Number.isFinite(valorTotal) || valorTotal <= 0) {
      const pv = prod.preco_venda != null ? Number(prod.preco_venda) : NaN;
      valorTotal = Number.isFinite(pv) && pv >= 0 ? pv : Number(prod.preco);
    }
  }

  if (!descricao) {
    return NextResponse.json({ error: "Informe a descrição do serviço." }, { status: 400 });
  }
  if (!Number.isFinite(valorTotal) || valorTotal <= 0) {
    return NextResponse.json({ error: "Valor total inválido." }, { status: 400 });
  }

  valorTotal = roundMoney(valorTotal);

  const cfg = await obterConfigEmissaoNotaas(supabase, empresaId);
  const aliquotaIss =
    body.aliquota_iss != null && Number.isFinite(Number(body.aliquota_iss))
      ? Number(body.aliquota_iss)
      : cfg.aliquotaIss;
  const codigoRaw = body.codigo_servico?.trim() || cfg.codigoServico;
  const codigoServico = normalizarCodigoServicoLc116(codigoRaw) ?? cfg.codigoServico;
  if (!codigoServico) {
    return NextResponse.json(
      {
        error:
          'Código de serviço inválido. Belém/podologia: use "060101" ou "06.01".',
      },
      { status: 400 },
    );
  }

  const cnaeRaw = body.cnae?.trim() || cfg.cnae || undefined;
  const cnae = cnaeRaw ? normalizarCnae(cnaeRaw) ?? undefined : undefined;
  if (!cnae) {
    return NextResponse.json(
      {
        error:
          "CNAE obrigatório para Belém (DSF). Informe o CNAE municipal do CNPJ (ex.: 869090400) em Parâmetros → Notaas. " +
          "O CNAE também deve estar cadastrado no projeto Notaas (Settings → CNAE).",
      },
      { status: 400 },
    );
  }
  const issRetido = body.iss_retido ?? cfg.issRetido;

  const apiKey = await obterApiKeyNotaas(supabase, empresaId);
  if (!apiKey) {
    return NextResponse.json(
      { error: "Configure NOTAAS_API_KEY ou a chave da empresa em Parâmetros." },
      { status: 503 },
    );
  }

  const referencia = `pod-${empresaId}-${Date.now()}`;

  const competenciaInformada = body.competencia?.trim();
  const competencia = competenciaInformada
    ? normalizarCompetenciaNfse(competenciaInformada)
    : undefined;
  if (competenciaInformada && !competencia) {
    return NextResponse.json(
      {
        error: 'Competência inválida ou futura. Use YYYY-MM (ex.: "2026-05") ou omita o campo.',
      },
      { status: 400 },
    );
  }

  const dataEmissaoRps = dataEmissaoRpsBrasilAbrasf();

  const payloadNotaasComMeta = {
    _podoquiro: {
      codigoServicoLc116: codigoServico,
      codigoServicoExibicao: formatCodigoLc116Exibicao(codigoServico),
      cnaeEsperado: cnae,
      cnaeExibicao: formatCnaeExibicao(cnae),
      dataEmissaoRpsEnviada: dataEmissaoRps,
      dataBrasil: dataHojeBrasilIso(),
      competenciaEnviada: competencia ?? null,
      competenciaOrigem: competencia ? "informada" : "padrao_notaas",
      observacao:
        "Código LC 116 enviado na API (/emitir). CNAE no projeto Notaas. Competência omitida = mês atual Notaas.",
    },
  };

  const payloadNotaas: NotaasEmitirBody = {
    tomador: {
      nome: nomePaciente(paciente),
      cpf,
      email: paciente.email?.trim() || undefined,
      telefone: paciente.telefone ? apenasDigitos(paciente.telefone) : undefined,
      endereco:
        paciente.cidade && paciente.uf
          ? {
              logradouro: paciente.logradouro?.trim() || undefined,
              numero: paciente.numero?.trim() || undefined,
              complemento: paciente.complemento?.trim() || undefined,
              bairro: paciente.bairro?.trim() || undefined,
              cidade: paciente.cidade.trim(),
              uf: (paciente.uf ?? "").trim().toUpperCase(),
              cep: paciente.cep ? apenasDigitos(paciente.cep) : undefined,
            }
          : undefined,
    },
    servico: {
      descricao,
      codigo: codigoServico,
    },
    valores: {
      total: valorTotal,
      aliquotaIss,
      issRetido,
    },
    ...(competencia ? { competencia } : {}),
    dataEmissao: dataEmissaoRps,
    referencia,
  };

  let respostaNotaas;
  const atividadeResposta = {
    codigo_lc116: codigoServico,
    codigo_exibicao: payloadNotaasComMeta._podoquiro.codigoServicoExibicao,
    cnae,
    cnae_exibicao: payloadNotaasComMeta._podoquiro.cnaeExibicao,
    enviado_na_api: { codigo: codigoServico },
    cnae_projeto_notaas: cnae,
  };
  try {
    respostaNotaas = await notaasEmitir(apiKey, payloadNotaas);
  } catch (e) {
    if (e instanceof NotaasApiError) {
      return NextResponse.json(
        { error: e.message, detalhe: e.body, atividade: atividadeResposta },
        { status: e.statusCode },
      );
    }
    const msg = e instanceof Error ? e.message : "Falha ao enfileirar NFS-e.";
    return NextResponse.json({ error: msg, atividade: atividadeResposta }, { status: 500 });
  }

  const statusInicial = statusNotaasParaInterno(respostaNotaas.status || "queued");

  const { data: insert, error: insErr } = await supabase
    .from("nfse_emissoes")
    .insert({
      id_empresa: empresaId,
      id_paciente: idPaciente,
      id_produto: idProduto,
      notaas_invoice_id: respostaNotaas.invoiceId,
      referencia,
      status: statusInicial,
      valor_total: valorTotal,
      aliquota_iss: aliquotaIss,
      iss_retido: issRetido,
      descricao_servico: descricao,
      codigo_servico: codigoServico ?? null,
      cnae,
      tomador_nome: nomePaciente(paciente),
      tomador_documento: cpf,
      tomador_email: paciente.email?.trim() || null,
      payload_envio: { ...payloadNotaasComMeta, ...payloadNotaas },
      payload_status: respostaNotaas,
    })
    .select("id, notaas_invoice_id, status, referencia, codigo_servico, cnae")
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    emissao: insert,
    notaas: respostaNotaas,
    atividade: atividadeResposta,
  });
}
