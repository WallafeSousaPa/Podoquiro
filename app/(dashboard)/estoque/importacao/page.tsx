import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getNomesSaudacao } from "@/lib/dashboard/saudacao";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ImportacaoNfeClient,
  type EmpresaListaItem,
} from "./importacao-nfe-client";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function EstoqueImportacaoPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    redirect("/login");
  }

  const { podeExcluirImportacaoEstoque } = await getNomesSaudacao(
    session.sub,
    session.usuario,
    session.idEmpresa,
  );

  const supabase = createAdminClient();
  let empresas: EmpresaListaItem[] = [];
  let loadError: string | null = null;

  try {
    const { data, error } = await supabase
      .from("empresas")
      .select("id, nome_fantasia")
      .eq("ativo", true)
      .order("nome_fantasia", { ascending: true });
    if (error) throw new Error(error.message);
    empresas = (data ?? []) as EmpresaListaItem[];
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Não foi possível carregar as empresas.";
  }

  const empresaIdPadrao =
    empresas.some((e) => e.id === empresaId) ? empresaId : (empresas[0]?.id ?? empresaId);

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Importação de NF-e</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Estoque</li>
                <li className="breadcrumb-item active">Importação</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <ImportacaoNfeClient
            empresas={empresas}
            empresaIdPadrao={empresaIdPadrao}
            loadError={loadError}
            podeExcluir={podeExcluirImportacaoEstoque}
          />
        </div>
      </section>
    </>
  );
}
