import { POST as emitirNfeProduto } from "@/app/api/nfe/emitir-produto/route";
import { ibgeMunicipioTomador } from "@/lib/cep/viacep";
import { empresaIdDaSessao } from "@/lib/estoque/parse-empresa-id";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

type RouteContext = { params: Promise<{ id: string }> };

type ItemSaida = {
  id_produto: string | null;
  qtd: number;
  v_un: number;
  v_desc?: number;
  v_total?: number;
};

/**
 * Emite NF-e (mod. 55) da saída de venda, para CPF ou CNPJ do comprador.
 */
export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const empresaId = empresaIdDaSessao(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const params = await context.params;
  const id = decodeURIComponent(String(params?.id ?? "")).trim();
  if (!isUuid(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: saida, error } = await supabase
    .from("estoque_saidas")
    .select("*, itens:estoque_saida_itens(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!saida) {
    return NextResponse.json({ error: "Saída não encontrada." }, { status: 404 });
  }
  if (saida.tipo !== "venda") {
    return NextResponse.json(
      { error: "A nota fiscal só se aplica a saídas do tipo venda." },
      { status: 400 },
    );
  }
  if (saida.status !== "confirmada") {
    return NextResponse.json({ error: "Só é possível emitir nota de saída confirmada." }, { status: 400 });
  }
  if (saida.nota_venda_status === "gerada") {
    return NextResponse.json(
      { error: "Esta venda já possui nota fiscal gerada." },
      { status: 400 },
    );
  }

  const destDoc = soDigitos(saida.dest_doc);
  const destTipo = saida.dest_tipo === "CNPJ" ? "CNPJ" : destDoc.length === 14 ? "CNPJ" : "CPF";
  if (destTipo === "CPF" && destDoc.length !== 11) {
    return NextResponse.json(
      { error: "O comprador precisa de um CPF válido (11 dígitos) para emitir a nota." },
      { status: 400 },
    );
  }
  if (destTipo === "CNPJ" && destDoc.length !== 14) {
    return NextResponse.json(
      { error: "O comprador precisa de um CNPJ válido (14 dígitos) para emitir a nota." },
      { status: 400 },
    );
  }

  const cep = soDigitos(saida.dest_cep);
  const ibge = await ibgeMunicipioTomador({
    cep,
    cidade: saida.dest_municipio,
  });
  if (!ibge || ibge.length !== 7) {
    return NextResponse.json(
      {
        error:
          "CEP/município do comprador não encontrado. Corrija o endereço do comprador e tente de novo.",
      },
      { status: 400 },
    );
  }

  const itensRaw = Array.isArray(saida.itens) ? (saida.itens as ItemSaida[]) : [];
  const itens = itensRaw
    .filter((it) => typeof it.id_produto === "string" && it.id_produto)
    .map((it) => {
      const qtd = Number(it.qtd);
      const vUn = Number(it.v_un);
      const vDesc = Number(it.v_desc ?? 0);
      const bruto = Math.round(qtd * vUn * 100) / 100;
      const desc = Math.min(Math.max(0, Math.round(vDesc * 100) / 100), bruto);
      const vTotal =
        Number.isFinite(Number(it.v_total)) && Number(it.v_total) >= 0
          ? Number(it.v_total)
          : Math.round((bruto - desc) * 100) / 100;
      return {
        id_produto: it.id_produto as string,
        quantidade: qtd,
        // Valor de venda já descontado — não usa o custo do produto.
        v_un: qtd > 0 ? vTotal / qtd : 0,
      };
    });
  if (itens.length === 0) {
    return NextResponse.json(
      { error: "A saída não tem produtos válidos para a nota." },
      { status: 400 },
    );
  }
  if (itens.some((it) => it.v_un <= 0)) {
    return NextResponse.json(
      {
        error:
          "A nota fiscal usa o valor de venda dos produtos. Informe um valor de venda maior que zero.",
      },
      { status: 400 },
    );
  }

  const destinatario = {
    cpf: destTipo === "CPF" ? destDoc : undefined,
    cnpj: destTipo === "CNPJ" ? destDoc : undefined,
    x_nome: String(saida.dest_nome ?? "").trim() || "Destinatário",
    x_lgr: String(saida.dest_endereco ?? "").trim() || "NAO INFORMADO",
    nro: String(saida.dest_numero ?? "").trim() || "S/N",
    x_bairro: String(saida.dest_bairro ?? "").trim() || "CENTRO",
    c_mun: ibge,
    x_mun: String(saida.dest_municipio ?? "").trim() || "NAO INFORMADO",
    uf: String(saida.dest_uf ?? "").trim().toUpperCase().slice(0, 2),
    cep: cep.padStart(8, "0"),
    ie: String(saida.dest_ie ?? "").trim() || undefined,
  };

  if (destinatario.uf.length !== 2 || cep.length !== 8) {
    return NextResponse.json(
      { error: "O comprador precisa de UF e CEP válidos para emitir a nota." },
      { status: 400 },
    );
  }

  const interno = new Request("http://localhost/api/nfe/emitir-produto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id_empresa: Number(saida.id_empresa) || empresaId,
      natureza_operacao: "VENDA DE MERCADORIA",
      destinatario,
      itens,
    }),
  });

  const emitRes = await emitirNfeProduto(interno);
  const json = (await emitRes.json()) as {
    ok?: boolean;
    idRegistro?: string;
    error?: string;
    xMotivo?: string;
    chave?: string;
    nNF?: number;
    serie?: number;
    protocolo?: string;
  };

  if (!emitRes.ok) {
    return NextResponse.json(
      { error: json.error ?? json.xMotivo ?? "Não foi possível emitir a nota fiscal." },
      { status: emitRes.status },
    );
  }

  if (json.ok && json.idRegistro) {
    const { error: upErr } = await supabase
      .from("estoque_saidas")
      .update({
        nota_venda_status: "gerada",
        id_nfe_emissao: json.idRegistro,
      })
      .eq("id", id);
    if (upErr) console.error(upErr);
  }

  if (!json.ok) {
    return NextResponse.json(
      {
        error: json.xMotivo ?? "A SEFAZ rejeitou a nota fiscal.",
        xMotivo: json.xMotivo,
        chave: json.chave,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    id_nfe_emissao: json.idRegistro,
    chave: json.chave,
    nNF: json.nNF,
    serie: json.serie,
    protocolo: json.protocolo,
    dest_tipo: destTipo,
    dest_doc: destDoc,
  });
}
