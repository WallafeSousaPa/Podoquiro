import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  bufferParaByteaPostgrest,
  prepararGravacaoCertificado,
} from "@/lib/sefaz/nfe/certificado-db";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const MAX_BYTES = 5 * 1024 * 1024;

/** Upload certificado A1 (.pfx/.p12) + senha → gravados cifrados na tabela empresa_nfe_certificados. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Use multipart/form-data." }, { status: 400 });
  }

  const senhaRaw = formData.get("senha");
  const arquivo = formData.get("certificado");

  const senha =
    typeof senhaRaw === "string" ? senhaRaw : senhaRaw != null ? String(senhaRaw) : "";

  if (!senha.trim()) {
    return NextResponse.json({ error: "Informe a senha do certificado." }, { status: 400 });
  }

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json(
      { error: "Envie o arquivo do certificado (.pfx ou .p12)." },
      { status: 400 },
    );
  }

  if (arquivo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Arquivo muito grande (máximo 5 MB)." },
      { status: 400 },
    );
  }

  const nome = arquivo.name.toLowerCase();
  if (!nome.endsWith(".pfx") && !nome.endsWith(".p12")) {
    return NextResponse.json(
      { error: "Use arquivo .pfx ou .p12." },
      { status: 400 },
    );
  }

  let pfxPlain: Buffer;
  try {
    const ab = await arquivo.arrayBuffer();
    pfxPlain = Buffer.from(ab);
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o arquivo." }, { status: 400 });
  }

  let payload: ReturnType<typeof prepararGravacaoCertificado>;
  try {
    payload = prepararGravacaoCertificado(pfxPlain, senha.trim());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao cifrar certificado.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("empresa_nfe_certificados").upsert(
    {
      id_empresa: empresaId,
      pfx_cifrado: bufferParaByteaPostgrest(payload.pfx_cifrado),
      senha_cifrada: payload.senha_cifrada,
    },
    { onConflict: "id_empresa" },
  );

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Remove certificado armazenado para a empresa da sessão. */
export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("empresa_nfe_certificados")
    .delete()
    .eq("id_empresa", empresaId);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
