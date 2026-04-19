import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { TiposPagamentoClient } from "./tipos-pagamento-client";

type FormaPagamentoRow = {
  id: number;
  nome: string;
  ativo: boolean;
};

export default async function TiposPagamentoPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const supabase = createAdminClient();
  let formas: FormaPagamentoRow[] = [];
  let loadError: string | null = null;

  try {
    const res = await supabase
      .from("formas_pagamento")
      .select("id, nome, ativo")
      .order("nome", { ascending: true });

    if (res.error) throw new Error(res.error.message);
    formas = (res.data ?? []) as FormaPagamentoRow[];
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Não foi possível carregar os dados.";
  }

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Tipos de pagamento</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Financeiro</li>
                <li className="breadcrumb-item">Parametrização</li>
                <li className="breadcrumb-item active">Tipos de pagamento</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <TiposPagamentoClient formasPagamento={formas} loadError={loadError} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
