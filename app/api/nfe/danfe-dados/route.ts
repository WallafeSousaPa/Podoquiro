import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { empresaIdDaSessao } from "@/lib/estoque/parse-empresa-id";
import { createAdminClient } from "@/lib/supabase/admin";
import { extrairDanfeNfeDoXml } from "@/lib/sefaz/nfe/parse-nfe-danfe";

const MARCADOR_NFE = "---NFe---";

/** Dados estruturados para montar o DANFE da NF-e (modelo 55). */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const empresaId = empresaIdDaSessao(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "Informe o id da emissão." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from("nfe_emissoes")
    .select(
      "id, ambiente, modelo, status, chave_acesso, protocolo_autorizacao, c_stat, xml_enviado",
    )
    .eq("id", id)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Emissão não encontrada." }, { status: 404 });
  }
  if (row.modelo !== 55) {
    return NextResponse.json({ error: "Esta emissão não é uma NF-e (modelo 55)." }, { status: 400 });
  }
  if (row.status !== "autorizada") {
    return NextResponse.json(
      { error: "DANFE disponível apenas para NF-e autorizada." },
      { status: 400 },
    );
  }

  const xmlEnviado = String(row.xml_enviado ?? "");
  const idx = xmlEnviado.indexOf(MARCADOR_NFE);
  const xmlNfe = idx >= 0 ? xmlEnviado.slice(idx + MARCADOR_NFE.length) : xmlEnviado;
  if (!xmlNfe.includes("infNFe")) {
    return NextResponse.json({ error: "XML da NF-e indisponível para esta emissão." }, { status: 400 });
  }

  let dados;
  try {
    dados = extrairDanfeNfeDoXml(xmlNfe);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao interpretar o XML da NF-e.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    ...dados,
    ambiente: row.ambiente,
    chave: row.chave_acesso,
    protocolo: row.protocolo_autorizacao,
  });
}
