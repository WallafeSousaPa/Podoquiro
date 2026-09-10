import type { ParceiroEstoqueRow } from "@/lib/estoque/parceiro-campos";
import type { TipoSaidaEstoque } from "@/lib/estoque/tipos-saida";
import { normalizarUfBr } from "@/lib/estoque/uf-br";

export type EmpresaSnapshotNfe = {
  id: number;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj_cpf: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
};

export type ItemPayloadNotaVenda = {
  n_item: number;
  id_produto: string;
  produto: string;
  sku: string | null;
  barcode: string | null;
  ncm: string | null;
  cfop: string | null;
  un_medida: string;
  quantidade: number;
  v_un: number;
  v_desc?: number;
  v_total: number;
};

export type PayloadNotaVenda = {
  versao: 1;
  modelo: 55;
  tipo: TipoSaidaEstoque;
  status: "pronta";
  gerada_em: null;
  emitente: {
    id_empresa: number;
    cnpj: string | null;
    razao_social: string | null;
    nome_fantasia: string | null;
    uf: string | null;
    municipio: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cep: string | null;
  };
  destinatario: {
    id_comprador: string;
    cpf: string | null;
    cnpj: string | null;
    x_nome: string;
    ie: string | null;
    x_lgr: string | null;
    nro: string | null;
    x_cpl: string | null;
    x_bairro: string | null;
    x_mun: string | null;
    uf: string | null;
    cep: string | null;
    email: string | null;
    fone: string | null;
  };
  itens: ItemPayloadNotaVenda[];
  totais: { valor_produtos: number };
};

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

export function montarPayloadNotaVenda(params: {
  empresa: EmpresaSnapshotNfe;
  comprador: ParceiroEstoqueRow;
  itens: ItemPayloadNotaVenda[];
  valorTotal: number;
}): PayloadNotaVenda {
  const doc = soDigitos(params.comprador.doc);
  return {
    versao: 1,
    modelo: 55,
    tipo: "venda",
    status: "pronta",
    gerada_em: null,
    emitente: {
      id_empresa: params.empresa.id,
      cnpj: soDigitos(params.empresa.cnpj_cpf).slice(0, 14) || null,
      razao_social: params.empresa.razao_social,
      nome_fantasia: params.empresa.nome_fantasia,
      uf: normalizarUfBr(params.empresa.estado),
      municipio: params.empresa.cidade,
      logradouro: params.empresa.endereco,
      numero: params.empresa.numero,
      complemento: params.empresa.complemento,
      bairro: params.empresa.bairro,
      cep: soDigitos(params.empresa.cep).slice(0, 8) || null,
    },
    destinatario: {
      id_comprador: params.comprador.id,
      cpf: doc.length === 11 ? doc : null,
      cnpj: doc.length === 14 ? doc : null,
      x_nome: params.comprador.razao_social?.trim() || params.comprador.nome,
      ie: params.comprador.ie,
      x_lgr: params.comprador.endereco,
      nro: params.comprador.numero,
      x_cpl: params.comprador.complemento,
      x_bairro: params.comprador.bairro,
      x_mun: params.comprador.municipio,
      uf: normalizarUfBr(params.comprador.uf),
      cep: soDigitos(params.comprador.cep).slice(0, 8) || null,
      email: params.comprador.email,
      fone: params.comprador.fone,
    },
    itens: params.itens,
    totais: { valor_produtos: params.valorTotal },
  };
}
