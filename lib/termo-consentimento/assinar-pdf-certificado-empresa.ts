/**
 * Assina PDF com certificado A1 da empresa (tabela empresa_nfe_certificados).
 * Servidor apenas — usa @signpdf (node-signpdf).
 */

import signpdf from "@signpdf/signpdf";
import { plainAddPlaceholderUltimaPagina } from "@/lib/termo-consentimento/plain-add-placeholder-ultima-pagina";
import { P12Signer } from "@signpdf/signer-p12";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarCertificadoEmpresa } from "@/lib/sefaz/nfe/carregar-certificado";
import { obterNomeTitularCertificadoPfx } from "@/lib/termo-consentimento/nome-titular-certificado";
import { adicionarRetanguloAssinaturaDigitalPdf } from "@/lib/termo-consentimento/retangulo-assinatura-digital-pdf";

export type MetadadosAssinaturaTermo = {
  reason: string;
  contactInfo: string;
  name: string;
  location: string;
};

export class ErroCertificadoTermoConsentimento extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroCertificadoTermoConsentimento";
  }
}

async function metadadosAssinaturaEmpresa(
  supabase: SupabaseClient,
  idEmpresa: number,
): Promise<MetadadosAssinaturaTermo> {
  const { data } = await supabase
    .from("empresas")
    .select("nome_fantasia, razao_social, cidade, estado")
    .eq("id", idEmpresa)
    .maybeSingle();

  const nome =
    (data?.nome_fantasia && String(data.nome_fantasia).trim()) ||
    (data?.razao_social && String(data.razao_social).trim()) ||
    "Clínica";
  const cidade = data?.cidade != null ? String(data.cidade).trim() : "";
  const uf = data?.estado != null ? String(data.estado).trim() : "";
  const local = [cidade, uf].filter(Boolean).join(" — ") || "Brasil";
  return {
    reason: "Termo de consentimento informado — assinatura digital da clínica",
    contactInfo: nome,
    name: nome,
    location: local,
  };
}

/**
 * Aplica assinatura PKCS#7 (PAdES) com o certificado digital da empresa.
 * @param pdfBuffer PDF já contendo a assinatura manuscrita do paciente (jsPDF no browser).
 */
export async function assinarPdfTermoComCertificadoEmpresa(
  supabase: SupabaseClient,
  idEmpresa: number,
  pdfBuffer: Buffer,
): Promise<Buffer> {
  if (!pdfBuffer.length) {
    throw new ErroCertificadoTermoConsentimento("PDF do termo vazio.");
  }

  let material: Awaited<ReturnType<typeof carregarCertificadoEmpresa>>;
  try {
    material = await carregarCertificadoEmpresa(supabase, idEmpresa);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/NFE_CERT_MASTER_KEY/i.test(msg)) {
      throw new ErroCertificadoTermoConsentimento(
        "Servidor sem NFE_CERT_MASTER_KEY configurada. Adicione a variável no ambiente de produção (Vercel/host) igual ao .env.local.",
      );
    }
    throw new ErroCertificadoTermoConsentimento(
      `Erro ao carregar certificado digital: ${msg}`,
    );
  }
  if (!material) {
    throw new ErroCertificadoTermoConsentimento(
      "Certificado digital não configurado. Cadastre o arquivo .pfx e a senha em Financeiro → Nota fiscal → Parâmetros.",
    );
  }

  const meta = await metadadosAssinaturaEmpresa(supabase, idEmpresa);
  const signingTime = new Date();
  let nomeTitularCert: string;
  try {
    nomeTitularCert = obterNomeTitularCertificadoPfx(material.pfx, material.senha);
  } catch (e) {
    throw new ErroCertificadoTermoConsentimento(
      `Não foi possível ler o titular do certificado: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let pdfPreparado: Buffer;
  let widgetRect: [number, number, number, number];
  let pageIndexAssinatura: number;
  try {
    const comRetangulo = await adicionarRetanguloAssinaturaDigitalPdf(pdfBuffer, {
      nomeEmpresa: meta.name,
      nomeTitularCertificado: nomeTitularCert,
      dataAssinatura: signingTime,
    });
    pdfPreparado = comRetangulo.pdfBuffer;
    widgetRect = comRetangulo.widgetRect;
    pageIndexAssinatura = comRetangulo.pageIndex;
  } catch (e) {
    throw new ErroCertificadoTermoConsentimento(
      `Não foi possível desenhar o retângulo de assinatura digital: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let pdfComPlaceholder: Buffer;
  try {
    pdfComPlaceholder = plainAddPlaceholderUltimaPagina({
      pdfBuffer: pdfPreparado,
      reason: meta.reason,
      contactInfo: meta.contactInfo,
      name: meta.name,
      location: meta.location,
      signingTime,
      appName: "Podoquiro",
      widgetRect,
      pageIndex: pageIndexAssinatura,
    });
  } catch (e) {
    throw new ErroCertificadoTermoConsentimento(
      `Não foi possível preparar o PDF para assinatura digital: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const signer = new P12Signer(material.pfx, { passphrase: material.senha });

  try {
    const assinado = await signpdf.sign(pdfComPlaceholder, signer, signingTime);
    return Buffer.from(assinado);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/passphrase|password|mac|decrypt|pkcs12|pfx/i.test(msg)) {
      throw new ErroCertificadoTermoConsentimento(
        "Senha do certificado digital incorreta ou arquivo .pfx inválido. Atualize em Financeiro → Nota fiscal → Parâmetros.",
      );
    }
    throw new ErroCertificadoTermoConsentimento(
      `Falha ao assinar o termo com certificado digital: ${msg}`,
    );
  }
}
