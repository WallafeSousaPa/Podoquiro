import type { ConfigFocusNfeEmpresa } from "./config";
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

function tipoLogradouro(logradouro: string): string {
  const l = logradouro.trim().toLowerCase();
  if (l.startsWith("av") || l.startsWith("avenida")) return "Av";
  if (l.startsWith("al") || l.startsWith("alameda")) return "Al";
  if (l.startsWith("trav") || l.startsWith("travessa")) return "Tv";
  if (l.startsWith("rod")) return "Rod";
  return "Rua";
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
}): FocusNfseEmitirBody {
  const { config, paciente, valorServicos, discriminacao } = params;
  const cpf = apenasDigitos(paciente.cpf ?? "");
  const incluirTomador = cpf.length === 11;

  const body: FocusNfseEmitirBody = {
    data_emissao: dataEmissaoIsoFocusBr(),
    natureza_operacao: config.naturezaOperacao,
    optante_simples_nacional: config.optanteSimplesNacional,
    prestador: {
      cnpj: config.prestadorCnpj,
      inscricao_municipal: config.prestadorInscricaoMunicipal,
      codigo_municipio: config.prestadorCodigoMunicipio,
    },
    servico: {
      iss_retido: params.issRetido ?? config.issRetidoPadrao,
      valor_servicos: Math.round(valorServicos * 100) / 100,
      item_lista_servico: config.itemListaServico,
      codigo_cnae: config.codigoCnae,
      discriminacao: discriminacao.trim(),
      codigo_municipio: config.prestadorCodigoMunicipio,
    },
  };

  if (incluirTomador) {
    const logradouro = (paciente.logradouro ?? "").trim() || "Não informado";
    const numero = (paciente.numero ?? "").trim() || "S/N";
    const bairro = (paciente.bairro ?? "").trim() || "Centro";
    const uf = (paciente.uf ?? "PA").trim().toUpperCase().slice(0, 2) || "PA";
    const cep = apenasDigitos(paciente.cep ?? "");
    if (cep.length !== 8) {
      throw new Error(
        "CEP do paciente inválido para NFS-e com tomador (8 dígitos). Corrija o cadastro ou remova o CPF.",
      );
    }

    body.tomador = {
      cpf,
      razao_social: nomeTomador(paciente),
      endereco: {
        logradouro,
        numero,
        tipo_logradouro: tipoLogradouro(logradouro),
        bairro,
        codigo_municipio: config.prestadorCodigoMunicipio,
        uf,
        cep,
        ...(paciente.complemento?.trim()
          ? { complemento: paciente.complemento.trim() }
          : {}),
      },
    };

    const email = paciente.email?.trim();
    if (email) body.tomador.email = email;

    const tel = apenasDigitos(paciente.telefone ?? "");
    if (tel.length >= 10) body.tomador.telefone = tel;
  }

  if (config.regimeEspecialTributacao) {
    body.regime_especial_tributacao = config.regimeEspecialTributacao;
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
