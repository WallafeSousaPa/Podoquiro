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
  };
  regime_especial_tributacao?: string;
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
