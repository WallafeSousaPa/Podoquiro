import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getNomesSaudacao } from "@/lib/dashboard/saudacao";
import { usuarioTemMenu } from "@/lib/dashboard/menus-catalogo";
import { createAdminClient } from "@/lib/supabase/admin";
import { LancamentosClient, type EmpresaOpcao } from "./lancamentos-client";
import "./lancamentos.css";

function nomeEmpresa(nomeFantasia: string | null, razaoSocial: string | null, id: number): string {
  return nomeFantasia?.trim() || razaoSocial?.trim() || `Loja #${id}`;
}

export default async function LancamentosPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { menusLiberados } = await getNomesSaudacao(
    session.sub,
    session.usuario,
    session.idEmpresa,
  );
  if (!usuarioTemMenu(menusLiberados, "financeiro.lancamentos")) redirect("/inicio");

  const supabase = createAdminClient();
  const empresaAtualId = Number(session.idEmpresa);

  const [empresasRes, formasRes, maquinetasRes] = await Promise.all([
    supabase
      .from("empresas")
      .select("id, nome_fantasia, razao_social")
      .order("id", { ascending: true }),
    supabase.from("formas_pagamento").select("nome").eq("ativo", true).order("nome"),
    supabase.from("maquinetas").select("nome").eq("ativo", true).order("nome"),
  ]);

  if (empresasRes.error) throw new Error(empresasRes.error.message);
  if (formasRes.error) throw new Error(formasRes.error.message);
  if (maquinetasRes.error) throw new Error(maquinetasRes.error.message);

  const empresas: EmpresaOpcao[] = (empresasRes.data ?? []).map((row) => ({
    id: row.id as number,
    nome: nomeEmpresa(
      row.nome_fantasia as string | null,
      row.razao_social as string | null,
      row.id as number,
    ),
  }));

  const meios = new Map<string, string>();
  for (const row of [...(formasRes.data ?? []), ...(maquinetasRes.data ?? [])]) {
    const nome = String(row.nome ?? "").trim();
    if (!nome) continue;
    const chave = nome.toLocaleLowerCase("pt-BR");
    if (!meios.has(chave)) meios.set(chave, nome);
  }

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Lançamentos</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Financeiro</li>
                <li className="breadcrumb-item active">Lançamentos</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid pb-4">
          <LancamentosClient
            empresas={empresas}
            meios={[...meios.values()]}
            empresaAtualId={empresaAtualId}
          />
        </div>
      </section>
    </>
  );
}
