/** Status interno (banco / UI). */
export type StatusNfseInterno =
  | "pendente"
  | "processando"
  | "emitida"
  | "erro"
  | "cancelada"
  | "contingencia";

/** Status retornado pela API Notaas. */
export type StatusNotaas =
  | "queued"
  | "processing"
  | "issued"
  | "error"
  | "cancelled";

export type NotaasEmitirBody = {
  tomador: {
    nome: string;
    cpf?: string;
    cnpj?: string;
    email?: string;
    telefone?: string;
    endereco?: {
      logradouro?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      cidade?: string;
      uf?: string;
      cep?: string;
    };
  };
  servico: {
    descricao: string;
    codigo?: string;
    codigoServico?: string;
    codigoTributacaoMunicipal?: string;
  };
  valores: {
    total: number;
    aliquotaIss: number;
    issRetido?: boolean;
  };
  competencia?: string;
  /** Data do RPS (ABRASF). Não documentado publicamente; Notaas pode usar em DSF/Belém. */
  dataEmissao?: string;
  referencia?: string;
};

export type NotaasEmitirResponse = {
  queued?: boolean;
  invoiceId: string;
  status: string;
  pollUrl?: string;
};

export type NotaasInvoiceStatus = {
  status: StatusNotaas | string;
  chNFSe?: string;
  numeroNfe?: string;
  nNFSe?: string;
  emittedAt?: string;
  issuedAt?: string;
  ambiente?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  documentsCached?: boolean;
  errorCode?: string;
  errorMessage?: string;
  errors?: Array<{ Codigo?: string; Descricao?: string; Complemento?: string }>;
  cancelledAt?: string;
  cancelXmlUrl?: string;
};

export type NotaasCancelarBody = {
  invoiceId: string;
  motivo?: string;
};

export type EmpresaNotaasConfigRow = {
  codigo_servico_padrao: string | null;
  aliquota_iss_padrao: number | null;
  iss_retido_padrao: boolean;
  updated_at: string;
  tem_api_key: boolean;
};
