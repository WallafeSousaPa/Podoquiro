export type FocusAmbiente = "homologacao" | "producao";

/**
 * Payload plano da NFS-e nacional (`POST /v2/nfsen`).
 * Belém usa este layout (DPS) mesmo sem Ambiente Nacional (ADN).
 */
export type FocusNfseEmitirBody = {
  data_emissao: string;
  data_competencia: string;
  /** Série da DPS. Em Belém a API deve usar 10001–49999 (L0022). */
  serie_dps: number;
  /** Número da DPS. Sem este campo a Focus reutiliza a numeração da empresa (série 1). */
  numero_dps: number;
  serie_rps?: string;
  numero_rps?: string;
  emitente_dps: number;
  codigo_municipio_emissora: number;
  cnpj_prestador: string;
  inscricao_municipal_prestador: string;
  /** 1 = não optante; 2 = MEI; 3 = ME/EPP. */
  codigo_opcao_simples_nacional: number;
  /** Layout nacional: 0 = nenhum (não confundir com o código 6 da API aninhada). */
  regime_especial_tributacao: number;
  cpf_tomador?: string;
  razao_social_tomador?: string;
  codigo_municipio_tomador?: number;
  cep_tomador?: string;
  logradouro_tomador?: string;
  numero_tomador?: string;
  complemento_tomador?: string;
  bairro_tomador?: string;
  telefone_tomador?: string;
  email_tomador?: string;
  codigo_municipio_prestacao: number;
  codigo_tributacao_nacional_iss: string;
  codigo_tributacao_municipal_iss: string;
  /** NBS (cNBS). Obrigatório no layout nacional; Belém rejeita E0316 se inválido. */
  codigo_nbs: string;
  descricao_servico: string;
  valor_servico: number;
  tributacao_iss: number;
  tipo_retencao_iss: number;
  /** CST PIS/COFINS (`situacao_tributaria_pis_cofins`). Substitui tpRetPisCofins no schema atual. */
  situacao_tributaria_pis_cofins: string;
  indicador_total_tributacao: string;
  finalidade_emissao: number;
  consumidor_final: number;
  indicador_destinatario: number;
  codigo_indicador_operacao: string;
  ibs_cbs_situacao_tributaria: string;
  ibs_cbs_classificacao_tributaria: string;
};

export type FocusNfseRespostaEmitir = {
  cnpj_prestador?: string;
  ref?: string;
  numero_rps?: string;
  serie_rps?: string;
  tipo_rps?: string;
  status?: string;
  erros?: { codigo?: string; mensagem?: string }[];
  mensagem?: string;
};

export type FocusNfseRespostaConsulta = FocusNfseRespostaEmitir & {
  numero?: string;
  codigo_verificacao?: string;
  data_emissao?: string;
  url?: string;
  url_danfse?: string;
  caminho_xml_nota_fiscal?: string;
};

export type FocusNfseRespostaCancelar = {
  status?: string;
  mensagem?: string;
};
