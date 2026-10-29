import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNfseAdn } from "@/lib/dashboard/nota-fiscal-permissao";
import { agendamentoPagamentoQuitado } from "@/lib/financeiro/agendamento-pagamento-quitado";
import {
  bloqueiaReemissaoFocusNfse,
  cpfValidoParaTomadorNfse,
  discriminacaoDeProcedimentos,
  mensagemCpfTomadorNfse,
  obterConfigFocusNfe,
  validarConfigPrestadorNfseNacional,
} from "@/lib/focusnfe";
import { ibgeMunicipioTomador } from "@/lib/cep/viacep";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assinarDpsXml,
  carregarCertificadoEmpresa,
  extrairCnpj14DoPfx,
  type AmbienteNfe,
} from "@/lib/sefaz/nfe";
import {
  SefinNfseApiError,
  enviarDpsSefinNacional,
  gerarRefNfseAdn,
  montarDpsXml,
  municipioNfseBelem,
  urlDanfseAdnLocal,
} from "@/lib/sefaz/nfse";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const SELECT_EMISSAO =
  "id, focus_ref, status, numero_nfse, codigo_verificacao, numero_rps, serie_rps, url_danfse, error_message, emitted_at, valor_servicos, discriminacao";

/** NFS-e na prefeitura: API municipal de Belém (DPS) ou Sefin nos demais municípios. */
export async function POST(request: Request) {
  const session = await getSession();
  const negado = await respostaSeSemPermissaoNfseAdn(session);
  if (negado) return negado;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let body: { id_agendamento?: number; iss_retido?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const idAgendamento = body.id_agendamento;
  if (!idAgendamento || !Number.isFinite(idAgendamento)) {
    return NextResponse.json({ error: "Informe id_agendamento." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const config = await obterConfigFocusNfe(supabase, empresaId);
  if (!config) {
    return NextResponse.json(
      { error: "Configure os parâmetros municipais da NFS-e (Nota Fiscal › Parâmetros da NFS-e) antes de emitir." },
      { status: 400 },
    );
  }

  const erroConfig = validarConfigPrestadorNfseNacional(config);
  if (erroConfig) {
    return NextResponse.json({ error: erroConfig }, { status: 400 });
  }

  const cert = await carregarCertificadoEmpresa(supabase, empresaId);
  if (!cert) {
    return NextResponse.json(
      { error: "Cadastre o certificado A1 da empresa (o mesmo da NF-e de produto) para emitir na prefeitura." },
      { status: 400 },
    );
  }

  let cnpjCert: string | null = null;
  try {
    cnpjCert = extrairCnpj14DoPfx(cert.pfx, cert.senha);
  } catch {
    cnpjCert = null;
  }
  if (cnpjCert && cnpjCert !== config.prestadorCnpj) {
    return NextResponse.json(
      {
        error:
          "CNPJ do certificado A1 não confere com o prestador cadastrado nos parâmetros da NFS-e.",
      },
      { status: 400 },
    );
  }

  const q = supabase
    .from("agendamentos")
    .select(
      `
        id,
        id_paciente,
        id_usuario,
        status,
        valor_total,
        pacientes (
          cpf, nome_completo, nome_social, email, telefone,
          cep, logradouro, numero, complemento, bairro, cidade, uf
        ),
        agendamento_procedimentos (
          procedimentos ( procedimento )
        ),
        pagamentos ( status_pagamento )
      `,
    )
    .eq("id", idAgendamento)
    .eq("id_empresa", empresaId);

  const { data: ag, error: agErr } = await q.maybeSingle();
  if (agErr) {
    return NextResponse.json({ error: agErr.message }, { status: 500 });
  }
  if (!ag) {
    return NextResponse.json({ error: "Atendimento não encontrado." }, { status: 400 });
  }
  if (String(ag.status) !== "realizado") {
    return NextResponse.json(
      { error: "Atendimento deve estar com status realizado." },
      { status: 400 },
    );
  }

  const pags = (ag.pagamentos as { status_pagamento: string }[] | null) ?? [];
  if (!agendamentoPagamentoQuitado(pags)) {
    return NextResponse.json(
      { error: "Pagamento do atendimento não está quitado." },
      { status: 400 },
    );
  }

  const { data: emissaoExistente } = await supabase
    .from("nfse_focus_emissoes")
    .select("id, status, numero_nfse")
    .eq("id_empresa", empresaId)
    .eq("id_agendamento", idAgendamento)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (emissaoExistente && bloqueiaReemissaoFocusNfse(emissaoExistente.status as string)) {
    const msg =
      (emissaoExistente.status as string).toLowerCase() === "autorizado"
        ? `Este atendimento já possui NFS-e emitida${emissaoExistente.numero_nfse ? ` (nº ${emissaoExistente.numero_nfse})` : ""}.`
        : "Já existe uma NFS-e em processamento para este atendimento.";
    return NextResponse.json({ error: msg, emissao: emissaoExistente }, { status: 409 });
  }

  const pacRaw = ag.pacientes as
    | {
        cpf: string | null;
        nome_completo: string | null;
        nome_social: string | null;
        email: string | null;
        telefone: string | null;
        cep: string | null;
        logradouro: string | null;
        numero: string | null;
        complemento: string | null;
        bairro: string | null;
        cidade: string | null;
        uf: string | null;
      }
    | {
        cpf: string | null;
        nome_completo: string | null;
        nome_social: string | null;
        email: string | null;
        telefone: string | null;
        cep: string | null;
        logradouro: string | null;
        numero: string | null;
        complemento: string | null;
        bairro: string | null;
        cidade: string | null;
        uf: string | null;
      }[]
    | null;
  const paciente = Array.isArray(pacRaw) ? pacRaw[0] : pacRaw;
  if (!paciente) {
    return NextResponse.json({ error: "Paciente não encontrado." }, { status: 400 });
  }
  const erroCpf = mensagemCpfTomadorNfse(paciente.cpf);
  if (erroCpf || !cpfValidoParaTomadorNfse(paciente.cpf)) {
    return NextResponse.json(
      {
        error:
          erroCpf ??
          "Cadastre o CPF do paciente para emitir a NFS-e. A prefeitura exige tomador identificado.",
      },
      { status: 400 },
    );
  }

  const procsRaw = ag.agendamento_procedimentos as
    | { procedimentos: { procedimento: string | null } | { procedimento: string | null }[] }[]
    | null;
  const procedimentos = (procsRaw ?? []).map((ap) => {
    const pr = ap.procedimentos;
    const p0 = Array.isArray(pr) ? pr[0] : pr;
    return { procedimento: p0?.procedimento ?? null };
  });

  const valorTotal = Number(ag.valor_total);
  let discriminacao: string;
  try {
    discriminacao = discriminacaoDeProcedimentos(procedimentos);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Discriminação inválida." },
      { status: 400 },
    );
  }

  const cepPaciente = String(paciente.cep ?? "").replace(/\D/g, "");
  if (cepPaciente.length !== 8) {
    return NextResponse.json(
      {
        error:
          "CEP do paciente inválido para NFS-e (8 dígitos). Corrija o cadastro do paciente.",
      },
      { status: 400 },
    );
  }
  const codigoMunicipioTomador =
    (await ibgeMunicipioTomador({
      cep: cepPaciente,
      cidade: paciente.cidade,
    })) ?? undefined;
  if (!codigoMunicipioTomador) {
    return NextResponse.json(
      {
        error:
          "CEP do paciente não foi encontrado ou não bate com o município. " +
          "Corrija o CEP/cidade no cadastro (ex.: Altamira = 1500602) e emita novamente.",
      },
      { status: 400 },
    );
  }

  const issRetido = body.iss_retido ?? config.issRetidoPadrao;
  const ref = gerarRefNfseAdn(idAgendamento);
  const ambiente: AmbienteNfe = config.ambiente === "homologacao" ? 2 : 1;
  const canal = municipioNfseBelem(config.prestadorCodigoMunicipio) ? "belem" : "adn";

  let dps;
  try {
    dps = montarDpsXml({
      config,
      paciente,
      valorServicos: valorTotal,
      discriminacao,
      issRetido,
      codigoMunicipioTomador,
      ambiente,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Dados inválidos para NFS-e." },
      { status: 400 },
    );
  }

  let xmlAssinado: string;
  try {
    xmlAssinado = assinarDpsXml(dps.xml, cert.pfx, cert.senha);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `Falha ao assinar a DPS: ${e.message}`
            : "Falha ao assinar a DPS com o certificado A1.",
      },
      { status: 500 },
    );
  }

  let enviado;
  try {
    enviado = await enviarDpsSefinNacional({
      xmlAssinado,
      pfx: cert.pfx,
      senha: cert.senha,
      ambiente,
      codigoMunicipioPrestador: config.prestadorCodigoMunicipio,
    });
  } catch (e) {
    if (e instanceof SefinNfseApiError) {
      return NextResponse.json(
        { error: e.message, detalhe: e.body, erros: e.erros },
        { status: e.status >= 400 && e.status < 600 ? e.status : 502 },
      );
    }
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Falha ao emitir NFS-e na prefeitura.",
      },
      { status: 502 },
    );
  }

  const { data: row, error: insErr } = await supabase
    .from("nfse_focus_emissoes")
    .insert({
      id_empresa: empresaId,
      id_agendamento: idAgendamento,
      id_paciente: ag.id_paciente,
      focus_ref: ref,
      status: "autorizado",
      numero_rps: String(dps.nDps),
      serie_rps: String(dps.serie),
      tipo_rps: "adn",
      numero_nfse: enviado.numeroNfse,
      codigo_verificacao: enviado.codigoVerificacao,
      valor_servicos: valorTotal,
      discriminacao,
      caminho_xml_nota_fiscal: enviado.xmlNfse ? canal : null,
      payload_envio: {
        canal,
        id_dps: dps.idDps,
        xml_dps: xmlAssinado,
      },
      payload_resposta: enviado.resposta,
      emitted_at: new Date().toISOString(),
    })
    .select(SELECT_EMISSAO)
    .single();

  if (insErr || !row) {
    return NextResponse.json(
      {
        error: `NFS-e autorizada${enviado.resposta.chaveAcesso ? ` (chave ${enviado.resposta.chaveAcesso})` : ""}, mas falhou ao gravar localmente: ${insErr?.message ?? "sem registro"}`,
        sefin: enviado.resposta,
      },
      { status: 500 },
    );
  }

  const urlDanfse = urlDanfseAdnLocal(row.id);
  const { error: urlErr } = await supabase
    .from("nfse_focus_emissoes")
    .update({ url_danfse: urlDanfse })
    .eq("id", row.id)
    .eq("id_empresa", empresaId);
  if (!urlErr) row.url_danfse = urlDanfse;

  return NextResponse.json({
    ok: true,
    emissao: row,
    sefin: enviado.resposta,
    status_interno: "autorizado",
  });
}
