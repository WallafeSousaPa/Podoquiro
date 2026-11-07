import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getNomesSaudacao } from "@/lib/dashboard/saudacao";
import { usuarioTemMenu } from "@/lib/dashboard/menus-catalogo";
import { nomeExibicaoPaciente } from "@/lib/pacientes";
import { assinaturaImagem } from "@/lib/assinatura-imagem";
import {
  CONTRATO_VAZIO,
  comAssinaturaEnfermeira,
  sanitizarContrato,
  type ContratoEnfermagem,
} from "@/lib/enfermagem/contrato";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContratosClient, type ContratoLista } from "./contratos-client";

export default async function PacientesContratosPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { menusLiberados } = await getNomesSaudacao(
    session.sub,
    session.usuario,
    session.idEmpresa,
  );
  if (!usuarioTemMenu(menusLiberados, "pacientes.contratos")) redirect("/inicio");

  const supabase = createAdminClient();
  let loadError: string | null = null;
  let contratos: ContratoLista[] = [];

  try {
    const { data, error } = await supabase
      .from("pacientes_contratos_enfermagem")
      .select("id, id_paciente, id_agendamento, id_usuario, created_at, dados, pacientes(nome_completo, nome_social)")
      .eq("id_empresa", Number(session.idEmpresa))
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const idsUsuarios = [
      ...new Set(
        (data ?? [])
          .map((row) => Number(row.id_usuario))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    ];
    const assinaturaPorUsuario = new Map<number, string>();
    if (idsUsuarios.length > 0) {
      const { data: usuarios, error: uErr } = await supabase
        .from("usuarios")
        .select("id, assinatura")
        .eq("id_empresa", Number(session.idEmpresa))
        .in("id", idsUsuarios);
      if (uErr) throw new Error(uErr.message);
      for (const usuario of usuarios ?? []) {
        const imagem = assinaturaImagem(usuario.assinatura);
        if (imagem) assinaturaPorUsuario.set(usuario.id as number, imagem);
      }
    }

    contratos = (data ?? []).map((row) => {
      const pacRaw = row.pacientes as
        | { nome_completo?: string | null; nome_social?: string | null }
        | { nome_completo?: string | null; nome_social?: string | null }[]
        | null;
      const pac = Array.isArray(pacRaw) ? pacRaw[0] : pacRaw;
      const limpo = sanitizarContrato(row.dados);
      const dados: ContratoEnfermagem = comAssinaturaEnfermeira(
        limpo.ok ? limpo.dados : { ...CONTRATO_VAZIO },
        assinaturaPorUsuario.get(Number(row.id_usuario)),
      );
      return {
        id: row.id as number,
        id_paciente: row.id_paciente as number,
        id_agendamento: (row.id_agendamento as number | null) ?? null,
        created_at: String(row.created_at),
        paciente_nome: nomeExibicaoPaciente({
          nome_completo: pac?.nome_completo ?? null,
          nome_social: pac?.nome_social ?? null,
        }) || `Paciente #${row.id_paciente as number}`,
        dados,
      };
    });
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Não foi possível carregar os contratos.";
  }

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Contratos</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item"><a href="/inicio">Início</a></li>
                <li className="breadcrumb-item">Pacientes</li>
                <li className="breadcrumb-item active">Contratos</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
      <section className="content">
        <div className="container-fluid">
          <ContratosClient loadError={loadError} contratos={contratos} />
        </div>
      </section>
    </>
  );
}
