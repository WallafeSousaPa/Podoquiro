import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { capturarDigitalFs80h, pixelsDaCaptura } from "@/lib/ponto/futronic-fs80h";
import { grayscaleParaDataUrl } from "@/lib/ponto/grayscale-png";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const bruto = await capturarDigitalFs80h(18);
  if (!bruto.ok) {
    return NextResponse.json(
      { ok: false, error: bruto.error || "Não foi possível ler a digital." },
      { status: 422 },
    );
  }

  try {
    const captura = pixelsDaCaptura(bruto);
    return NextResponse.json({
      ok: true,
      leitor: bruto.leitor ?? "Futronic FS80H",
      width: captura.width,
      height: captura.height,
      pixelsBase64: captura.pixelsBase64,
      pngDataUrl: grayscaleParaDataUrl(captura.width, captura.height, captura.pixels),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Captura inválida." },
      { status: 422 },
    );
  }
}
