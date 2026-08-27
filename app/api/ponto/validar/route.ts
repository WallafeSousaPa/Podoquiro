import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listarCadastrosDigitaisTeste } from "@/lib/ponto/cadastros-temporarios";
import { capturarDigitalFs80h, pixelsDaCaptura } from "@/lib/ponto/futronic-fs80h";
import { grayscaleParaDataUrl } from "@/lib/ponto/grayscale-png";
import {
  decidirIdentificacao,
  LIMIAR_VALIDACAO_TESTE,
  ranquearDigitaisSourceAfis,
} from "@/lib/ponto/sourceafis-matcher";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const cadastros = listarCadastrosDigitaisTeste();
  if (cadastros.length === 0) {
    return NextResponse.json(
      { error: "Cadastre ao menos uma digital de teste antes de validar." },
      { status: 400 },
    );
  }

  const bruto = await capturarDigitalFs80h(18);
  if (!bruto.ok) {
    return NextResponse.json(
      { ok: false, error: bruto.error || "Não foi possível ler a digital." },
      { status: 422 },
    );
  }

  const probe = pixelsDaCaptura(bruto);
  let ranque;
  try {
    ranque = await ranquearDigitaisSourceAfis(probe, cadastros);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : "Não foi possível reconhecer a digital.",
      },
      { status: 500 },
    );
  }

  const decisao = decidirIdentificacao(ranque);

  return NextResponse.json({
    ok: true,
    valido: decisao.valido,
    limiar: LIMIAR_VALIDACAO_TESTE,
    melhor: decisao.melhor,
    motivo: decisao.motivo,
    comparacoes: ranque,
    captura: {
      width: probe.width,
      height: probe.height,
      pngDataUrl: grayscaleParaDataUrl(probe.width, probe.height, probe.pixels),
    },
  });
}
