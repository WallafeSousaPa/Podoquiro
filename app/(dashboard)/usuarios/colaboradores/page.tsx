import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ColaboradoresClient } from "./colaboradores-client";

export default async function ColaboradoresPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const empresaId = Number(session.idEmpresa);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    redirect("/inicio");
  }

  const supabase = createAdminClient();
  let usuarios: {
    id: number;
    usuario: string;
    nome: string;
  }[] = [];
  let procedimentos: {
    id: number;
    procedimento: string;
    valor_total: number;
    ativo: boolean;
  }[] = [];
  let loadError: string | null = null;

  try {
    const [uRes, pRes] = await Promise.all([
      supabase
        .from("usuarios")
        .select("id, usuario, nome_completo")
        .eq("id_empresa", empresaId)
        .eq("ativo", true)
        .order("nome_completo", { ascending: true })
        .order("usuario", { ascending: true }),
      supabase
        .from("procedimentos")
        .select("id, procedimento, valor_total, ativo")
        .eq("id_empresa", empresaId)
        .order("procedimento", { ascending: true }),
    ]);
    if (uRes.error) throw new Error(uRes.error.message);
    if (pRes.error) throw new Error(pRes.error.message);
    usuarios = (uRes.data ?? []).map((r) => ({
      id: r.id as number,
      usuario: r.usuario as string,
      nome:
        (r.nome_completo != null && String(r.nome_completo).trim()) ||
        (r.usuario as string),
    }));
    procedimentos = (pRes.data ?? []).map((r) => ({
      id: r.id as number,
      procedimento: r.procedimento as string,
      valor_total: Number(r.valor_total),
      ativo: Boolean(r.ativo),
    }));
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
              <h1 className="m-0 text-dark">Colaboradores</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Usuários</li>
                <li className="breadcrumb-item active">Colaboradores</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <p className="text-muted small mb-3">
            Defina quais procedimentos cada usuário pode executar. Na agenda, o
            profissional só poderá lançar os procedimentos vinculados aqui.
          </p>
          <div className="row">
            <div className="col-12">
              <ColaboradoresClient
                usuarios={usuarios}
                procedimentosEmpresa={procedimentos}
                loadError={loadError}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
