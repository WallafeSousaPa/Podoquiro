import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { respostaSeSemPermissaoNfceAcesso } from "@/lib/dashboard/nota-fiscal-permissao";
import { createAdminClient } from "@/lib/supabase/admin";
import { extrairDanfeNfceDoXml } from "@/lib/sefaz/nfe";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const MARCADOR_NFCE = "---NFCe---";

/** Dados estruturados para montar o DANFE-NFC-e (parse do XML armazenado em nfe_emissoes). */
export async function GET(request: Request) {
  const session = await getSession();
  const bloqueio = await respostaSeSemPermissaoNfceAcesso(session);
  if (bloqueio) return bloqueio;

  const empresaId = parseEmpresaId(session!.idEmpresa);
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
      "id, ambiente, modelo, status, chave_acesso, protocolo_autorizacao, c_stat, xml_enviado, payload_rascunho",
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
  if (row.modelo !== 65) {
    return NextResponse.json({ error: "Esta emissão não é uma NFC-e (modelo 65)." }, { status: 400 });
  }
  if (row.status !== "autorizada") {
    return NextResponse.json(
      { error: "DANFE disponível apenas para NFC-e autorizada." },
      { status: 400 },
    );
  }

  const xmlEnviado = String(row.xml_enviado ?? "");
  const idx = xmlEnviado.indexOf(MARCADOR_NFCE);
  const xmlNfce = idx >= 0 ? xmlEnviado.slice(idx + MARCADOR_NFCE.length) : xmlEnviado;
  if (!xmlNfce.includes("infNFe")) {
    return NextResponse.json({ error: "XML da NFC-e indisponível para esta emissão." }, { status: 400 });
  }

  let dados;
  try {
    dados = extrairDanfeNfceDoXml(xmlNfce);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao interpretar o XML da NFC-e.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Reforça QR Code / urlChave a partir do payload, se o parse do XML não os trouxer.
  const payload = (row.payload_rascunho ?? {}) as Record<string, unknown>;
  if (!dados.qrCode && typeof payload.qr_code === "string") dados.qrCode = payload.qr_code;
  if (!dados.urlChave && typeof payload.url_chave === "string") dados.urlChave = payload.url_chave;

  // Complementa endereço do emitente com o cadastro da empresa quando o XML está incompleto.
  const { data: emp } = await supabase
    .from("empresas")
    .select(
      "razao_social, nome_fantasia, cnpj_cpf, cep, endereco, numero, complemento, bairro, cidade, estado",
    )
    .eq("id", empresaId)
    .maybeSingle();

  if (emp) {
    const vazio = (s: string) => !s.trim() || s.trim().toUpperCase() === "NAO INFORMADO";
    if (vazio(dados.emit.xNome) && emp.razao_social) {
      dados.emit.xNome = String(emp.razao_social).trim();
    }
    if (!dados.emit.xFant?.trim() && emp.nome_fantasia) {
      dados.emit.xFant = String(emp.nome_fantasia).trim();
    }
    if (!dados.emit.cnpj?.trim() && emp.cnpj_cpf) {
      dados.emit.cnpj = String(emp.cnpj_cpf).replace(/\D/g, "");
    }
    if (vazio(dados.emit.xLgr) && emp.endereco) {
      dados.emit.xLgr = String(emp.endereco).trim();
    }
    if (vazio(dados.emit.nro) && emp.numero) {
      dados.emit.nro = String(emp.numero).trim();
    }
    if (!dados.emit.xCpl?.trim() && emp.complemento) {
      dados.emit.xCpl = String(emp.complemento).trim();
    }
    if (vazio(dados.emit.xBairro) && emp.bairro) {
      dados.emit.xBairro = String(emp.bairro).trim();
    }
    if (vazio(dados.emit.xMun) && emp.cidade) {
      dados.emit.xMun = String(emp.cidade).trim();
    }
    if (!dados.emit.uf?.trim() && emp.estado) {
      dados.emit.uf = String(emp.estado).trim().toUpperCase().slice(0, 2);
    }
    if (!dados.emit.cep?.replace(/\D/g, "") && emp.cep) {
      dados.emit.cep = String(emp.cep).replace(/\D/g, "").padStart(8, "0");
    }
  }

  return NextResponse.json({
    ...dados,
    ambiente: row.ambiente,
    chave: row.chave_acesso,
    protocolo: row.protocolo_autorizacao,
  });
}
