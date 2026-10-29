import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNfseAdn } from "@/lib/dashboard/nota-fiscal-permissao";
import { obterConfigFocusNfe } from "@/lib/focusnfe";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarCertificadoEmpresa, type AmbienteNfe } from "@/lib/sefaz/nfe";
import {
  baixarDanfsePdf,
  chaveAcessoNfseDeResposta,
  ehRefNfseAdn,
  extrairDadosDanfse,
  nfseXmlGZipDeResposta,
  renderDanfsePdfBuffer,
  type DadosDanfse,
} from "@/lib/sefaz/nfse";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function completarDados(
  base: DadosDanfse,
  extra: Partial<DadosDanfse>,
): DadosDanfse {
  return {
    chave: base.chave || extra.chave || "",
    numero: base.numero || extra.numero || "",
    serie: base.serie || extra.serie || "",
    competencia: base.competencia || extra.competencia || "",
    dhEmi: base.dhEmi || extra.dhEmi || "",
    codigoVerificacao: base.codigoVerificacao || extra.codigoVerificacao || "",
    municipioEmi: base.municipioEmi || extra.municipioEmi || "Belém / PA",
    prestadorNome: base.prestadorNome || extra.prestadorNome || "",
    prestadorCnpj: base.prestadorCnpj || extra.prestadorCnpj || "",
    prestadorIm: base.prestadorIm || extra.prestadorIm || "",
    tomadorNome: base.tomadorNome || extra.tomadorNome || "",
    tomadorDoc: base.tomadorDoc || extra.tomadorDoc || "",
    tomadorEndereco: base.tomadorEndereco || extra.tomadorEndereco || "",
    discriminacao: base.discriminacao || extra.discriminacao || "",
    valor: base.valor || extra.valor || "",
  };
}

/** Proxy autenticado do DANFSe: tenta o PDF oficial e, se falhar, gera a partir do XML autorizado. */
export async function GET(request: Request) {
  const session = await getSession();
  const negado = await respostaSeSemPermissaoNfseAdn(session);
  if (negado) return negado;

  const empresaId = parseEmpresaId(session!.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Informe o id da emissão." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row, error: loadErr } = await supabase
    .from("nfse_focus_emissoes")
    .select(
      "id, focus_ref, status, numero_nfse, numero_rps, serie_rps, codigo_verificacao, valor_servicos, discriminacao, emitted_at, payload_resposta",
    )
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Emissão não encontrada." }, { status: 404 });
  }
  if (!ehRefNfseAdn(row.focus_ref as string)) {
    return NextResponse.json(
      { error: "Esta NFS-e não foi emitida pela prefeitura." },
      { status: 400 },
    );
  }
  if (String(row.status).toLowerCase() !== "autorizado") {
    return NextResponse.json(
      { error: "A NFS-e ainda não está autorizada." },
      { status: 409 },
    );
  }

  const chave = chaveAcessoNfseDeResposta(row.payload_resposta);
  if (!chave) {
    return NextResponse.json(
      { error: "A emissão não tem chave de acesso para gerar o PDF." },
      { status: 422 },
    );
  }

  const config = await obterConfigFocusNfe(supabase, empresaId);
  const ambiente: AmbienteNfe = config?.ambiente === "homologacao" ? 2 : 1;
  const cert = await carregarCertificadoEmpresa(supabase, empresaId);

  if (cert) {
    try {
      const oficial = await baixarDanfsePdf({
        chaveAcesso: chave,
        pfx: cert.pfx,
        senha: cert.senha,
        ambiente,
        codigoMunicipioPrestador: config?.prestadorCodigoMunicipio,
      });
      const numero = String(row.numero_nfse ?? chave).replace(/[^\w.-]+/g, "");
      return new NextResponse(new Uint8Array(oficial), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="DANFSe-${numero}.pdf"`,
          "Cache-Control": "private, max-age=300",
        },
      });
    } catch {
      /* gera a partir do XML autorizado */
    }
  }

  const xml = nfseXmlGZipDeResposta(row.payload_resposta);
  const { data: emp } = await supabase
    .from("empresas")
    .select("razao_social, nome_fantasia")
    .eq("id", empresaId)
    .maybeSingle();

  const extraidos = xml ? extrairDadosDanfse(xml, chave) : extrairDadosDanfse("", chave);
  const dados = completarDados(extraidos, {
    chave,
    numero: String(row.numero_nfse ?? ""),
    serie: String(row.serie_rps ?? ""),
    dhEmi: String(row.emitted_at ?? ""),
    codigoVerificacao: String(row.codigo_verificacao ?? ""),
    prestadorNome:
      String(emp?.razao_social ?? "").trim() || String(emp?.nome_fantasia ?? "").trim(),
    prestadorCnpj: config?.prestadorCnpj ?? "",
    prestadorIm: config?.prestadorInscricaoMunicipal ?? "",
    discriminacao: String(row.discriminacao ?? ""),
    valor: String(row.valor_servicos ?? ""),
  });

  if (!dados.numero && !dados.discriminacao && !xml) {
    return NextResponse.json(
      { error: "Não foi possível montar o PDF desta NFS-e." },
      { status: 502 },
    );
  }

  const pdf = await renderDanfsePdfBuffer(dados);
  const numero = String(dados.numero || row.numero_nfse || chave).replace(/[^\w.-]+/g, "");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="DANFSe-${numero}.pdf"`,
      "Cache-Control": "private, max-age=120",
    },
  });
}
