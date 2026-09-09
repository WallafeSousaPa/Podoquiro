import type { ConfigFocusNfeEmpresa } from "./config";
import { NBS_PODOLOGIA_PEDICURE } from "@/lib/notaas/codigo-servico";
import type { FocusNfseEmitirBody } from "./types";

export type PacienteFocusTomador = {
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
};

function apenasDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** CPF com 11 dígitos — necessário para enviar bloco tomador à Focus. */
export function cpfValidoParaTomadorNfse(cpf: string | null | undefined): boolean {
  return apenasDigitos(cpf ?? "").length === 11;
}

function nomeTomador(p: PacienteFocusTomador): string {
  const nc = p.nome_completo?.trim();
  const ns = p.nome_social?.trim();
  return nc || ns || "Tomador";
}

/** Data/hora atual em Brasília no formato exigido pela Focus (`-03:00`). */
export function dataEmissaoIsoFocusBr(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}-03:00`;
}

/**
 * Regime especial no layout nacional (regEspTrib).
 * O código 6 da API aninhada é ME/EPP do Simples — no nacional isso é `opSimpNac=3` + regime 0.
 */
function regimeEspecialNacional(raw: string | null): number {
  const v = (raw ?? "").trim();
  if (v === "1") return 3; // microempresa municipal
  if (v === "2") return 2; // estimativa
  if (v === "3") return 6; // sociedade de profissionais
  if (v === "4") return 1; // cooperativa
  return 0;
}

/** Discriminação da NFS-e = nomes dos procedimentos realizados no atendimento. */
export function discriminacaoDeProcedimentos(
  procedimentos: { procedimento: string | null }[],
): string {
  const nomes = procedimentos
    .map((p) => (p.procedimento ?? "").trim())
    .filter(Boolean);
  if (nomes.length === 0) {
    throw new Error(
      "O atendimento não possui procedimentos lançados para montar a discriminação da NFS-e.",
    );
  }
  const texto = nomes.join("; ");
  return texto.length > 2000 ? `${texto.slice(0, 1997)}...` : texto;
}

export function montarPayloadFocusNfse(params: {
  config: ConfigFocusNfeEmpresa;
  paciente: PacienteFocusTomador;
  valorServicos: number;
  discriminacao: string;
  issRetido?: boolean;
  /** IBGE do município do tomador (CEP). Não usar o município do prestador. */
  codigoMunicipioTomador?: string;
}): FocusNfseEmitirBody {
  const { config, paciente, valorServicos, discriminacao } = params;
  const cpf = apenasDigitos(paciente.cpf ?? "");
  const incluirTomador = cpf.length === 11;
  const dataEmissao = dataEmissaoIsoFocusBr();
  const municipio = Number(config.prestadorCodigoMunicipio);
  const issRetido = params.issRetido ?? config.issRetidoPadrao;
  const serieDps = Number(config.serieRps);
  const numeroDps = Date.now();

  const body: FocusNfseEmitirBody = {
    data_emissao: dataEmissao,
    data_competencia: dataEmissao.slice(0, 10),
    serie_dps: serieDps,
    numero_dps: numeroDps,
    serie_rps: String(serieDps),
    numero_rps: String(numeroDps),
    emitente_dps: 1,
    codigo_municipio_emissora: municipio,
    cnpj_prestador: config.prestadorCnpj,
    inscricao_municipal_prestador: config.prestadorInscricaoMunicipal,
    codigo_opcao_simples_nacional: config.optanteSimplesNacional ? 3 : 1,
    regime_especial_tributacao: regimeEspecialNacional(config.regimeEspecialTributacao),
    codigo_municipio_prestacao: municipio,
    codigo_tributacao_nacional_iss: config.itemListaServico,
    codigo_tributacao_municipal_iss: config.codigoTributarioMunicipio,
    codigo_nbs: NBS_PODOLOGIA_PEDICURE,
    descricao_servico: discriminacao.trim(),
    valor_servico: Math.round(valorServicos * 100) / 100,
    tributacao_iss: 1,
    tipo_retencao_iss: issRetido ? 2 : 1,
    situacao_tributaria_pis_cofins: "00",
    indicador_total_tributacao: "0",
    finalidade_emissao: 0,
    consumidor_final: 0,
    indicador_destinatario: 0,
    codigo_indicador_operacao: "030101",
    ibs_cbs_situacao_tributaria: "200",
    ibs_cbs_classificacao_tributaria: "200029",
  };

  if (incluirTomador) {
    const cep = apenasDigitos(paciente.cep ?? "");
    if (cep.length !== 8) {
      throw new Error(
        "CEP do paciente inválido para NFS-e com tomador (8 dígitos). Corrija o cadastro ou remova o CPF.",
      );
    }
    const ibgeTomador = Number(params.codigoMunicipioTomador);
    if (!Number.isFinite(ibgeTomador) || ibgeTomador <= 0) {
      throw new Error(
        "Não foi possível obter o município IBGE do CEP do paciente. Corrija o CEP no cadastro.",
      );
    }
    body.cpf_tomador = cpf;
    body.razao_social_tomador = nomeTomador(paciente);
    body.codigo_municipio_tomador = ibgeTomador;
    body.cep_tomador = cep;
    body.logradouro_tomador = (paciente.logradouro ?? "").trim() || "Não informado";
    body.numero_tomador = (paciente.numero ?? "").trim() || "S/N";
    body.bairro_tomador = (paciente.bairro ?? "").trim() || "Centro";
    const complemento = paciente.complemento?.trim();
    if (complemento) body.complemento_tomador = complemento;
    const email = paciente.email?.trim();
    if (email) body.email_tomador = email;
    const tel = apenasDigitos(paciente.telefone ?? "");
    if (tel.length >= 10) body.telefone_tomador = tel;
  }

  return body;
}

export function gerarRefFocusNfse(idAgendamento: number): string {
  return `pod-${idAgendamento}-${Date.now()}`;
}

export function statusInternoDeFocus(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s === "autorizado") return "autorizado";
  if (s === "cancelado") return "cancelado";
  if (s === "erro_autorizacao") return "erro";
  if (s === "processando_autorizacao" || s === "processando") return "processando";
  return s || "processando";
}

/** NFS-e autorizada pode ser cancelada na prefeitura via Focus. */
export function podeCancelarFocusNfse(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase() === "autorizado";
}

/** Impede nova emissão para o mesmo atendimento. */
export function bloqueiaReemissaoFocusNfse(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return (
    s === "autorizado" ||
    s === "processando_autorizacao" ||
    s === "processando"
  );
}
