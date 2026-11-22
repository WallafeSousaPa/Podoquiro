import { NextResponse } from "next/server";
import { acessoLancamentos } from "@/lib/financeiro/lancamentos-acesso";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const acesso = await acessoLancamentos();
  if (!acesso.ok) return acesso.response;

  const id = Number((await params).id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Lançamento inválido." }, { status: 400 });
  }

  const { data: atual, error: lErr } = await acesso.supabase
    .from("financeiro_lancamentos")
    .select("id, origem")
    .eq("id", id)
    .maybeSingle();
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
  if (!atual) {
    return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  }
  if (atual.origem === "caixa") {
    return NextResponse.json(
      { error: "Lançamento importado do caixa não pode ser excluído." },
      { status: 400 },
    );
  }

  const { data, error } = await acesso.supabase
    .from("financeiro_lancamentos")
    .delete()
    .eq("id", id)
    .neq("origem", "caixa")
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
