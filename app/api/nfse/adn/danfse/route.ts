import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNfseAdn } from "@/lib/dashboard/nota-fiscal-permissao";
import { obterConfigFocusNfe } from "@/lib/focusnfe";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarCertificadoEmpresa, type AmbienteNfe } from "@/lib/sefaz/nfe";
import { baixarDanfsePdf, chaveAcessoNfseDeResposta, ehRefNfseAdn } from "@/lib/sefaz/nfse";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Proxy autenticado do DANFSe (PDF oficial) pela chave da NFS-e municipal. */
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
    .select("id, focus_ref, status, numero_nfse, payload_resposta")
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

  const cert = await carregarCertificadoEmpresa(supabase, empresaId);
  if (!cert) {
    return NextResponse.json(
      { error: "Cadastre o certificado A1 da empresa para baixar o DANFSe." },
      { status: 400 },
    );
  }

  const config = await obterConfigFocusNfe(supabase, empresaId);
  const ambiente: AmbienteNfe = config?.ambiente === "homologacao" ? 2 : 1;

  let pdf: Buffer;
  try {
    pdf = await baixarDanfsePdf({
      chaveAcesso: chave,
      pfx: cert.pfx,
      senha: cert.senha,
      ambiente,
      codigoMunicipioPrestador: config?.prestadorCodigoMunicipio,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao baixar o DANFSe.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const numero = String(row.numero_nfse ?? chave).replace(/[^\w.-]+/g, "");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="DANFSe-${numero}.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
