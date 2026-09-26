import { hashAssinaturaRpsDsf } from "./assinatura-rps";
import { DSF_BELEM_IBGE, DSF_BELEM_SIAFI } from "./urls";

export type DadosRpsDsf = {
  cnpjPrestador: string;
  razaoPrestador: string;
  imPrestador: string;
  cnae: string;
  aliquotaIss: number;
  issRetido: boolean;
  serieRps: string;
  numeroRps: string;
  dataEmissaoIso: string;
  discriminacao: string;
  valorServicos: number;
  tomador: {
    cpf: string;
    nome: string;
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cep: string;
    email?: string;
    telefone?: string;
    cidadeIbge: string;
    cidadeNome: string;
  };
};

function esc(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function ymd(iso: string): string {
  return iso.slice(0, 10);
}

function cidadeDsf(ibge: string): string {
  const d = ibge.replace(/\D/g, "");
  if (d === DSF_BELEM_IBGE || d === "150142") return DSF_BELEM_SIAFI;
  return d || DSF_BELEM_SIAFI;
}

function splitFone(tel: string | undefined): { ddd: string; numero: string } {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length >= 10) return { ddd: d.slice(0, 2), numero: d.slice(2, 11) };
  return { ddd: "", numero: "" };
}

export const SERIE_RPS_DSF_PADRAO = "NF";

export function montarXmlLoteRpsDsf(d: DadosRpsDsf): { xml: string; idLote: string } {
  const dataYmd = ymd(d.dataEmissaoIso);
  const idLote = `lote:${d.numeroRps}`;
  const tributacao = "T";
  const situacao = "N";
  const tipoRecolhimento = d.issRetido ? "R" : "A";
  const cnae10 = d.cnae.replace(/\D/g, "").padStart(10, "0").slice(-10);
  const hash = hashAssinaturaRpsDsf({
    inscricaoMunicipal: d.imPrestador,
    serieRps: d.serieRps,
    numeroRps: d.numeroRps,
    dataEmissaoYmd: dataYmd,
    tributacao,
    situacaoRps: situacao,
    tipoRecolhimento,
    valorServicos: d.valorServicos,
    valorDeducoes: 0,
    codigoAtividade: cnae10,
    cpfCnpjTomador: d.tomador.cpf,
  });
  const cidadeToma = cidadeDsf(d.tomador.cidadeIbge);
  const foneToma = splitFone(d.tomador.telefone);
  const valor = d.valorServicos.toFixed(2);
  const valorUn = d.valorServicos.toFixed(4);
  const aliq = d.aliquotaIss.toFixed(4);
  const cpl = d.tomador.complemento?.trim()
    ? `<ComplementoEnderecoTomador>${esc(d.tomador.complemento)}</ComplementoEnderecoTomador>`
    : "";
  const email = (d.tomador.email ?? "").trim() || "nao-informado@localhost";
  const cpfToma = d.tomador.cpf.replace(/\D/g, "");

  const rps = `<RPS Id="rps:${d.numeroRps}"><Assinatura>${hash}</Assinatura><InscricaoMunicipalPrestador>${esc(d.imPrestador)}</InscricaoMunicipalPrestador><RazaoSocialPrestador>${esc(d.razaoPrestador)}</RazaoSocialPrestador><TipoRPS>RPS</TipoRPS><SerieRPS>${esc(d.serieRps)}</SerieRPS><NumeroRPS>${esc(d.numeroRps)}</NumeroRPS><DataEmissaoRPS>${dataYmd}</DataEmissaoRPS><SituacaoRPS>${situacao}</SituacaoRPS><SeriePrestacao>99</SeriePrestacao><CPFCNPJTomador>${cpfToma}</CPFCNPJTomador><RazaoSocialTomador>${esc(d.tomador.nome)}</RazaoSocialTomador><TipoLogradouroTomador>RUA</TipoLogradouroTomador><LogradouroTomador>${esc(d.tomador.logradouro || "Nao informado")}</LogradouroTomador><NumeroEnderecoTomador>${esc(d.tomador.numero || "S/N")}</NumeroEnderecoTomador>${cpl}<TipoBairroTomador>Bairro</TipoBairroTomador><BairroTomador>${esc(d.tomador.bairro || "Centro")}</BairroTomador><CidadeTomador>${cidadeToma}</CidadeTomador><CidadeTomadorDescricao>${esc(d.tomador.cidadeNome || "Belem")}</CidadeTomadorDescricao><CEPTomador>${d.tomador.cep.replace(/\D/g, "")}</CEPTomador><EmailTomador>${esc(email)}</EmailTomador><CodigoAtividade>${cnae10}</CodigoAtividade><AliquotaAtividade>${aliq}</AliquotaAtividade><TipoRecolhimento>${tipoRecolhimento}</TipoRecolhimento><MunicipioPrestacao>${DSF_BELEM_SIAFI}</MunicipioPrestacao><MunicipioPrestacaoDescricao>Belem</MunicipioPrestacaoDescricao><Operacao>A</Operacao><Tributacao>${tributacao}</Tributacao><ValorPIS>0.00</ValorPIS><ValorCOFINS>0.00</ValorCOFINS><ValorINSS>0.00</ValorINSS><ValorIR>0.00</ValorIR><ValorCSLL>0.00</ValorCSLL><AliquotaPIS>0.0000</AliquotaPIS><AliquotaCOFINS>0.0000</AliquotaCOFINS><AliquotaINSS>0.0000</AliquotaINSS><AliquotaIR>0.0000</AliquotaIR><AliquotaCSLL>0.0000</AliquotaCSLL><DescricaoRPS>${esc(d.discriminacao.slice(0, 1500))}</DescricaoRPS><DDDPrestador></DDDPrestador><TelefonePrestador></TelefonePrestador><DDDTomador>${foneToma.ddd}</DDDTomador><TelefoneTomador>${foneToma.numero}</TelefoneTomador><Itens><Item><DiscriminacaoServico>${esc(d.discriminacao.slice(0, 500))}</DiscriminacaoServico><Quantidade>1.00</Quantidade><ValorUnitario>${valorUn}</ValorUnitario><ValorTotal>${valor}</ValorTotal><Tributavel>S</Tributavel></Item></Itens></RPS>`;

  const xml = `<ns1:ReqEnvioLoteRPS xmlns:ns1="http://localhost:8080/WsNFe2/lote" xmlns:tipos="http://localhost:8080/WsNFe2/tp" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://localhost:8080/WsNFe2/lote http://localhost:8080/WsNFe2/xsd/ReqEnvioLoteRPS.xsd"><Cabecalho><CodCidade>${DSF_BELEM_SIAFI}</CodCidade><CPFCNPJRemetente>${d.cnpjPrestador}</CPFCNPJRemetente><RazaoSocialRemetente>${esc(d.razaoPrestador)}</RazaoSocialRemetente><Transacao>true</Transacao><DtInicio>${dataYmd}</DtInicio><DtFim>${dataYmd}</DtFim><QtdRPS>1</QtdRPS><ValorTotalServicos>${valor}</ValorTotalServicos><ValorTotalDeducoes>0.00</ValorTotalDeducoes><Versao>1</Versao><MetodoEnvio>WS</MetodoEnvio></Cabecalho><Lote Id="${idLote}">${rps}</Lote></ns1:ReqEnvioLoteRPS>`;

  return { xml, idLote };
}
