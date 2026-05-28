import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getNotaasBaseUrl, obterApiKeyNotaas } from "@/lib/notaas";
import { createAdminClient } from "@/lib/supabase/admin";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Proxy autenticado para PDF/XML da Notaas (quando URLs CDN ainda não estão no registro local). */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  const tipo = url.searchParams.get("tipo")?.trim() || "pdf";

  if (!id) {
    return NextResponse.json({ error: "Informe o id da emissão." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row, error: loadErr } = await supabase
    .from("nfse_emissoes")
    .select("id, notaas_invoice_id, status, pdf_url, xml_url")
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!row?.notaas_invoice_id) {
    return NextResponse.json({ error: "Emissão não encontrada." }, { status: 404 });
  }

  if (tipo === "pdf" && row.pdf_url) {
    return NextResponse.redirect(row.pdf_url as string);
  }
  if (tipo === "xml" && row.xml_url) {
    return NextResponse.redirect(row.xml_url as string);
  }

  const apiKey = await obterApiKeyNotaas(supabase, empresaId);
  if (!apiKey) {
    return NextResponse.json({ error: "API Notaas não configurada." }, { status: 503 });
  }

  const path =
    tipo === "xml"
      ? `/invoices/${encodeURIComponent(row.notaas_invoice_id as string)}/xml`
      : `/invoices/${encodeURIComponent(row.notaas_invoice_id as string)}/pdf`;

  const res = await fetch(`${getNotaasBaseUrl()}${path}`, {
    headers: { "x-api-key": apiKey },
    redirect: "manual",
  });

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (loc) return NextResponse.redirect(loc);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Documento indisponível (${res.status}).`, detalhe: txt.slice(0, 500) },
      { status: res.status },
    );
  }

  const contentType =
    res.headers.get("content-type") ||
    (tipo === "xml" ? "application/xml" : "application/pdf");

  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="nfse-${row.notaas_invoice_id}.${tipo === "xml" ? "xml" : "pdf"}"`,
    },
  });
}
