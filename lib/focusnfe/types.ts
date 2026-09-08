export type FocusAmbiente = "homologacao" | "producao";

export type FocusNfseEndereco = {
  logradouro: string;
  numero: string;
  tipo_logradouro?: string;
  bairro: string;
  codigo_municipio: string;
  uf: string;
  cep: string;
  complemento?: string;
};

export type FocusNfseEmitirBody = {
  data_emissao: string;
  natureza_operacao: string;
  optante_simples_nacional: boolean;
  prestador: {
    cnpj: string;
    inscricao_municipal: string;
    codigo_municipio: string;
  };
  /** Opcional — omitido quando o paciente não possui CPF válido. */
  tomador?: {
    cpf?: string;
    cnpj?: string;
    razao_social: string;
    email?: string;
    telefone?: string;
    endereco: FocusNfseEndereco;
  };
  servico: {
    iss_retido: boolean;
    valor_servicos: number;
    item_lista_servico: string;
    codigo_cnae: string;
    discriminacao: string;
    codigo_municipio: string;
    /**
     * NFS-e nacional (`tpRetPisCofins`). `0` = PIS/COFINS/CSLL não retidos.
     * Sem este campo a Focus pode gerar `<trib>` vazio.
     */
    tipo_retencao_pis_cofins?: string;
    /**
     * Código de tributação municipal (`cTribMun`). Belém (NFS-e nacional) rejeita
     * com L0017 se este campo não for enviado.
     */
    codigo_tributario_municipio?: string;
  };
  regime_especial_tributacao?: string;
  /**
   * Total aproximado dos tributos no Simples Nacional (`pTotTribSN`).
   * Obrigatório no layout nacional quando o prestador é optante do SN.
   */
  percentual_total_tributos_simples_nacional?: number;
  /** Percentuais IBPT / Lei da Transparência — não optante do SN (`pTotTribFed/Est/Mun`). */
  percentual_total_tributos_federais?: number;
  percentual_total_tributos_estaduais?: number;
  percentual_total_tributos_municipais?: number;
  /** Desdobro municipal (cTribMun), em geral 3 dígitos. */
  codigo_tributacao_municipal_iss?: string;
  /**
   * Série do RPS/DPS. Belém (NFS-e nacional) rejeita L0022 se a série
   * estiver entre 00001 e 10000 (faixa do sistema municipal).
   */
  serie_rps?: string;
  /** Alias do layout nacional (`serie` da DPS). */
  serie_dps?: number;
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
