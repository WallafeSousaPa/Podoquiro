import type { ConfigFocusNfeEmpresa } from "@/lib/focusnfe/config";
import {
  dataEmissaoIsoFocusBr,
  type PacienteFocusTomador,
} from "@/lib/focusnfe/montar-payload";
import { NBS_PODOLOGIA_PEDICURE } from "@/lib/notaas/codigo-servico";
import type { AmbienteNfe } from "../nfe/types";
import { montarIdInfDps } from "./id-dps";

const VER_APLIC = "Podoquiro_1.0.0";

export type DadosDpsMontada = {
  xml: string;
  idDps: string;
  serie: number;
  nDps: number;
  dhEmi: string;
  dCompet: string;
};

function apenasDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function semControle(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

function escXml(s: string): string {
  return semControle(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function money2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function nomeTomador(p: PacienteFocusTomador): string {
  const nc = p.nome_completo?.trim();
  const ns = p.nome_social?.trim();
  return nc || ns || "Tomador";
}

/** Regime especial no layout nacional (`regEspTrib`). */
function regimeEspecialNacional(raw: string | null): number {
  const v = (raw ?? "").trim();
  if (v === "1") return 3;
  if (v === "2") return 2;
  if (v === "3") return 6;
  if (v === "4") return 1;
  return 0;
}

function nbs9Digitos(raw: string): string {
  const d = apenasDigitos(raw);
  if (d.length === 9) return d;
  return "126022000";
}

/**
 * DPS 1.01 (Sefin Nacional), no mesmo leiaute que a Focus gerava,
 * com bloco `<toma>` obrigatório (L9999 em Belém).
 */
export function montarDpsXml(params: {
  config: ConfigFocusNfeEmpresa;
  paciente: PacienteFocusTomador;
  valorServicos: number;
  discriminacao: string;
  codigoMunicipioTomador: string;
  ambiente: AmbienteNfe;
  issRetido?: boolean;
}): DadosDpsMontada {
  const { config, paciente, valorServicos, discriminacao, ambiente } = params;
  const cnpj = apenasDigitos(config.prestadorCnpj);
  const cLocEmi = apenasDigitos(config.prestadorCodigoMunicipio);
  const serie = Number(config.serieRps) || 10001;
  const nDps = Date.now();
  const idDps = montarIdInfDps({ cLocEmi, cnpj, serie, nDps });
  const dhEmi = dataEmissaoIsoFocusBr();
  const dCompet = dhEmi.slice(0, 10);
  const issRetido = params.issRetido ?? config.issRetidoPadrao;
  const cpf = apenasDigitos(paciente.cpf ?? "");
  const cep = apenasDigitos(paciente.cep ?? "");
  const cMunToma = apenasDigitos(params.codigoMunicipioTomador);
  const nbs = nbs9Digitos(NBS_PODOLOGIA_PEDICURE);
  const opSimpNac = config.optanteSimplesNacional ? 3 : 1;
  const xDesc = escXml(discriminacao.trim().slice(0, 2000));

  const xCpl = paciente.complemento?.trim();
  const email = paciente.email?.trim();
  const fone = apenasDigitos(paciente.telefone ?? "");

  const tomaEndCpl = xCpl ? `\n        <xCpl>${escXml(xCpl)}</xCpl>` : "";
  const tomaFone = fone.length >= 10 ? `\n      <fone>${fone}</fone>` : "";
  const tomaEmail = email ? `\n      <email>${escXml(email)}</email>` : "";

  const xml = `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">
  <infDPS Id="${idDps}">
    <tpAmb>${ambiente}</tpAmb>
    <dhEmi>${dhEmi}</dhEmi>
    <verAplic>${VER_APLIC}</verAplic>
    <serie>${serie}</serie>
    <nDPS>${nDps}</nDPS>
    <dCompet>${dCompet}</dCompet>
    <tpEmit>1</tpEmit>
    <cLocEmi>${cLocEmi}</cLocEmi>
    <prest>
      <CNPJ>${cnpj}</CNPJ>
      <IM>${escXml(config.prestadorInscricaoMunicipal)}</IM>
      <regTrib>
        <opSimpNac>${opSimpNac}</opSimpNac>
        <regEspTrib>${regimeEspecialNacional(config.regimeEspecialTributacao)}</regEspTrib>
      </regTrib>
    </prest>
    <toma>
      <CPF>${cpf}</CPF>
      <xNome>${escXml(nomeTomador(paciente))}</xNome>
      <end>
        <endNac>
          <cMun>${cMunToma}</cMun>
          <CEP>${cep}</CEP>
        </endNac>
        <xLgr>${escXml((paciente.logradouro ?? "").trim() || "Não informado")}</xLgr>
        <nro>${escXml((paciente.numero ?? "").trim() || "S/N")}</nro>${tomaEndCpl}
        <xBairro>${escXml((paciente.bairro ?? "").trim() || "Centro")}</xBairro>
      </end>${tomaFone}${tomaEmail}
    </toma>
    <serv>
      <locPrest>
        <cLocPrestacao>${cLocEmi}</cLocPrestacao>
      </locPrest>
      <cServ>
        <cTribNac>${escXml(config.itemListaServico)}</cTribNac>
        <cTribMun>${escXml(config.codigoTributarioMunicipio)}</cTribMun>
        <xDescServ>${xDesc}</xDescServ>
        <cNBS>${nbs}</cNBS>
      </cServ>
    </serv>
    <valores>
      <vServPrest>
        <vServ>${money2(valorServicos)}</vServ>
      </vServPrest>
      <trib>
        <tribMun>
          <tribISSQN>1</tribISSQN>
          <tpRetISSQN>${issRetido ? 2 : 1}</tpRetISSQN>
        </tribMun>
        <tribFed>
          <piscofins>
            <CST>00</CST>
          </piscofins>
        </tribFed>
        <totTrib>
          <indTotTrib>0</indTotTrib>
        </totTrib>
      </trib>
    </valores>
    <IBSCBS>
      <finNFSe>0</finNFSe>
      <indFinal>1</indFinal>
      <cIndOp>030101</cIndOp>
      <indDest>0</indDest>
      <valores>
        <trib>
          <gIBSCBS>
            <CST>200</CST>
            <cClassTrib>200029</cClassTrib>
          </gIBSCBS>
        </trib>
      </valores>
    </IBSCBS>
  </infDPS>
</DPS>`;

  return { xml, idDps, serie, nDps, dhEmi, dCompet };
}
