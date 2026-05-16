import { NextResponse } from "next/server";
import {
  assinarPdfTermoComCertificadoEmpresa,
  ErroCertificadoTermoConsentimento,
} from "@/lib/termo-consentimento/assinar-pdf-certificado-empresa";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function empresaIdOuNull(idEmpresa: string): number | null {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Recebe o PDF do termo (já com assinatura do paciente) e devolve o mesmo PDF
 * assinado com o certificado A1 da empresa (empresa_nfe_certificados).
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const idEmpresa = empresaIdOuNull(session.idEmpresa);
  if (idEmpresa == null) {
    return NextResponse.json({ error: "Empresa inválida na sessão." }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formulário inválido." }, { status: 400 });
  }

  const entrada = formData.get("pdf");
  // Safari/iOS costuma enviar Blob (não File) mesmo com nome no FormData.
  if (!(entrada instanceof Blob) || entrada.size <= 0) {
    return NextResponse.json({ error: "Envie o arquivo PDF do termo (campo pdf)." }, { status: 400 });
  }

  const tipo = (entrada.type || "").toLowerCase();
  if (tipo && tipo !== "application/pdf") {
    return NextResponse.json({ error: "O arquivo deve ser um PDF." }, { status: 400 });
  }

  let pdfEntrada: Buffer;
  try {
    pdfEntrada = Buffer.from(await entrada.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: "Não foi possível ler o PDF enviado. Tente novamente." },
      { status: 400 },
    );
  }

  if (!pdfEntrada.length) {
    return NextResponse.json(
      { error: "O PDF do termo chegou vazio. No celular, tente limpar a assinatura e confirmar de novo." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  try {
    const pdfAssinado = await assinarPdfTermoComCertificadoEmpresa(supabase, idEmpresa, pdfEntrada);

    const nomeOriginal =
      entrada instanceof File && entrada.name.trim()
        ? entrada.name
        : typeof formData.get("pdf_nome") === "string"
          ? String(formData.get("pdf_nome"))
          : "termo";
    const nomeSaida = nomeOriginal.replace(/\.pdf$/i, "").trim() || "termo";
    const filename = `${nomeSaida}_certificado.pdf`;

    return new NextResponse(new Uint8Array(pdfAssinado), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ErroCertificadoTermoConsentimento) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[assinar-certificado]", e);
    const erroConfig =
      /NFE_CERT_MASTER_KEY|placeholder-plain|node_modules|certificado cifrado/i.test(msg);
    if (erroConfig) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "development"
            ? msg
            : "Erro interno ao assinar o termo com certificado digital. Tente no computador ou contate o suporte.",
      },
      { status: 500 },
    );
  }
}
