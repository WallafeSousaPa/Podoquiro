import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  listarCadastrosDigitaisTeste,
  removerCadastroDigitalTeste,
  salvarCadastroDigitalTeste,
} from "@/lib/ponto/cadastros-temporarios";
import { capturarDigitalFs80h, pixelsDaCaptura } from "@/lib/ponto/futronic-fs80h";
import { grayscaleParaDataUrl } from "@/lib/ponto/grayscale-png";

export const runtime = "nodejs";
export const maxDuration = 30;

function publico(row: {
  id: string;
  nome: string;
  width: number;
  height: number;
  pixelsBase64: string;
  criadoEm: string;
}) {
  const pixels = Buffer.from(row.pixelsBase64, "base64");
  return {
    id: row.id,
    nome: row.nome,
    width: row.width,
    height: row.height,
    criadoEm: row.criadoEm,
    pngDataUrl: grayscaleParaDataUrl(row.width, row.height, pixels),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    temporario: true,
    cadastros: listarCadastrosDigitaisTeste().map(publico),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: {
    nome?: unknown;
    width?: unknown;
    height?: unknown;
    pixelsBase64?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) {
    return NextResponse.json({ error: "Informe um nome para o cadastro de teste." }, { status: 400 });
  }

  let width = Number(body.width);
  let height = Number(body.height);
  let pixelsBase64 = typeof body.pixelsBase64 === "string" ? body.pixelsBase64 : "";

  if (!pixelsBase64) {
    const bruto = await capturarDigitalFs80h(18);
    if (!bruto.ok) {
      return NextResponse.json(
        { error: bruto.error || "Não foi possível ler a digital." },
        { status: 422 },
      );
    }
    const captura = pixelsDaCaptura(bruto);
    width = captura.width;
    height = captura.height;
    pixelsBase64 = captura.pixelsBase64;
  }

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return NextResponse.json({ error: "Imagem da digital inválida." }, { status: 400 });
  }

  const item = salvarCadastroDigitalTeste({ nome, width, height, pixelsBase64 });
  return NextResponse.json({ ok: true, cadastro: publico(item) });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "Informe o id do cadastro." }, { status: 400 });
  }
  const ok = removerCadastroDigitalTeste(id);
  if (!ok) {
    return NextResponse.json({ error: "Cadastro não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
