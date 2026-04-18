import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { nomeExibicaoPaciente } from "@/lib/pacientes";
import { createAdminClient } from "@/lib/supabase/admin";
import { PacientesCadastroClient } from "./pacientes-cadastro-client";

type PacienteRaw = {
  id: number;
  cpf: string | null;
  nome_completo: string | null;
  nome_social: string | null;
  genero: string | null;
  data_nascimento: string | null;
  estado_civil: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
};

export default async function PacientesCadastroPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const empresaId = Number(session.idEmpresa);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    redirect("/inicio");
  }

  const supabase = createAdminClient();
  let pacientes: PacienteRaw[] = [];
  let loadError: string | null = null;

  try {
    const { data, error } = await supabase
      .from("pacientes")
      .select(
        "id, cpf, nome_completo, nome_social, genero, data_nascimento, estado_civil, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, ativo",
      )
      .eq("id_empresa", empresaId);

    if (error) throw new Error(error.message);
    pacientes = (data ?? []) as PacienteRaw[];
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Não foi possível carregar os pacientes.";
  }

  const sorted = [...pacientes].sort((a, b) =>
    nomeExibicaoPaciente(a).localeCompare(nomeExibicaoPaciente(b), "pt-BR", {
      sensitivity: "base",
    }),
  );

  const pacientesView = sorted.map((p) => ({
    ...p,
    nome_exibicao: nomeExibicaoPaciente(p),
  }));

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Cadastro de pacientes</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Pacientes</li>
                <li className="breadcrumb-item active">Cadastrar</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <PacientesCadastroClient pacientes={pacientesView} loadError={loadError} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
