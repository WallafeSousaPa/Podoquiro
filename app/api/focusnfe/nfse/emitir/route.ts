import { NextResponse } from "next/server";

/** Emissão NFS-e pela Focus NFe desativada — use POST `/api/nfse/adn/emitir`. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "A emissão pela Focus NFe foi desativada. Use Emitir NFS-e — a nota vai direto para a prefeitura.",
    },
    { status: 410 },
  );
}
