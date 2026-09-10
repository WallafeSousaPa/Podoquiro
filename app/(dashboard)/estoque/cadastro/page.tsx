import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNomesSaudacao } from "@/lib/dashboard/saudacao";
import { CHAVE_ACAO_PRECO_VENDA_PRODUTO, usuarioTemMenu } from "@/lib/dashboard/menus-catalogo";
import { aplicarPrecoTabelaLoja } from "@/lib/estoque/tabelas-preco";
import {
  ProdutosCadastroClient,
  type EmpresaListaItem,
  type ProdutoRow,
  type TabelaPrecoListaItem,
} from "./produtos-cadastro-client";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function EstoqueCadastroPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    redirect("/login");
  }

  const { menusLiberados } = await getNomesSaudacao(
    session.sub,
    session.usuario,
    session.idEmpresa,
  );
  const podeEditarPrecoVenda = usuarioTemMenu(menusLiberados, CHAVE_ACAO_PRECO_VENDA_PRODUTO);

  const supabase = createAdminClient();
  let produtos: ProdutoRow[] = [];
  let empresas: EmpresaListaItem[] = [];
  let tabelasPreco: TabelaPrecoListaItem[] = [];
  let loadError: string | null = null;

  try {
    const [resProd, resEmp, resTab] = await Promise.all([
      supabase
        .from("produtos")
        .select("*")
        .eq("id_empresa", empresaId)
        .order("produto", { ascending: true }),
      supabase
        .from("empresas")
        .select("id, nome_fantasia, tabela_preco_id")
        .order("nome_fantasia", { ascending: true }),
      supabase
        .from("tabelas_preco")
        .select("id, nome, descricao, ativo")
        .order("nome", { ascending: true }),
    ]);

    if (resProd.error) throw new Error(resProd.error.message);
    if (resEmp.error) {
      const retry = await supabase
        .from("empresas")
        .select("id, nome_fantasia")
        .order("nome_fantasia", { ascending: true });
      if (retry.error) throw new Error(retry.error.message);
      empresas = (retry.data ?? []) as EmpresaListaItem[];
    } else {
      empresas = (resEmp.data ?? []) as EmpresaListaItem[];
    }
    if (resTab.error) {
      console.error(resTab.error);
    } else {
      tabelasPreco = (resTab.data ?? []) as TabelaPrecoListaItem[];
    }
    produtos = await aplicarPrecoTabelaLoja(
      supabase,
      (resProd.data ?? []) as ProdutoRow[],
      empresaId,
    );
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
              <h1 className="m-0 text-dark">Cadastro de produtos</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Estoque</li>
                <li className="breadcrumb-item active">Cadastro</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <ProdutosCadastroClient
                produtos={produtos}
                empresas={empresas}
                tabelasPreco={tabelasPreco}
                empresaIdPadrao={empresaId}
                loadError={loadError}
                podeEditarPrecoVenda={podeEditarPrecoVenda}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
