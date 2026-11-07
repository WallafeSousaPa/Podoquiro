import { redirect } from "next/navigation";
import { diasEntreAnamnesesDoValorDb } from "@/lib/avaliacoes/anamnese-intervalo";
import { SELECT_PACIENTES_EVOLUCAO_VINCULOS } from "@/lib/avaliacoes/evolucao";
import { getSession } from "@/lib/auth/session";
import { getUsuarioGrupoAdministrativo } from "@/lib/dashboard/menu-grupo";
import { nomeExibicaoPaciente } from "@/lib/pacientes";
import { createAdminClient } from "@/lib/supabase/admin";
import { AvaliacoesClient } from "./avaliacoes-client";

type ItemRef = { id: number; tipo?: string | null; condicao?: string | null; ativo: boolean };

export default async function PacientesAvaliacoesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createAdminClient();
  const idUsuarioSessao = Number(session.sub);
  let loadError: string | null = null;
  let pacientes: { id: number; nome: string }[] = [];
  let responsaveis: { id: number; nome: string }[] = [];
  let evolucoes: Record<string, unknown>[] = [];
  let condicoes: ItemRef[] = [];
  let tiposUnhas: ItemRef[] = [];
  let tiposPe: ItemRef[] = [];
  let hidroses: ItemRef[] = [];
  let lesoes: ItemRef[] = [];
  let formatosDedos: ItemRef[] = [];
  let formatosPe: ItemRef[] = [];
  let podeParametrizarAnamnese = false;
  let diasEntreAnamnesesInicial: number | null = null;
  let diasEntreAnamnesesEnfermagemInicial: number | null = null;
  let fichasEnfermagem: {
    id: number;
    id_paciente: number;
    id_agendamento: number;
    id_usuario: number;
    updated_at: string;
    dados: Record<string, unknown> | null;
    arquivo_termo_assinatura_virtual: string | null;
    pacientes: { nome_completo?: string | null; nome_social?: string | null } | null;
    usuarios: { nome_completo?: string | null; usuario?: string | null } | null;
  }[] = [];

  try {
    const evolucaoSelect =
      "*, pacientes(id,nome_completo,nome_social,telefone), usuarios(id,usuario,nome_completo), " +
      SELECT_PACIENTES_EVOLUCAO_VINCULOS;

    const [
      pacientesRes,
      usuariosRes,
      evolRes,
      condRes,
      unhaRes,
      peRes,
      hidRes,
      lesRes,
      fdRes,
      fpRes,
      empresaRes,
      fichasRes,
    ] = await Promise.all([
      supabase.from("pacientes").select("id, nome_completo, nome_social, telefone").order("id", { ascending: false }),
      supabase.from("usuarios").select("id, usuario, nome_completo").eq("ativo", true).order("nome_completo", { ascending: true }),
      supabase.from("pacientes_evolucao").select(evolucaoSelect).order("data", { ascending: false }).limit(200),
      supabase.from("condicoes_saude").select("id, condicao, ativo").order("condicao", { ascending: true }),
      supabase.from("tipos_unhas").select("id, tipo, ativo").order("tipo", { ascending: true }),
      supabase.from("tipo_pe").select("id, tipo, ativo").order("tipo", { ascending: true }),
      supabase.from("hidroses").select("id, tipo, ativo").order("tipo", { ascending: true }),
      supabase.from("lesoes_mecanicas").select("id, tipo, ativo").order("tipo", { ascending: true }),
      supabase.from("formato_dedos").select("id, tipo, ativo").order("tipo", { ascending: true }),
      supabase.from("formato_pe").select("id, tipo, ativo").order("tipo", { ascending: true }),
      supabase
        .from("empresas")
        .select("dias_entre_anamneses, dias_entre_anamneses_enfermagem")
        .eq("id", Number(session.idEmpresa))
        .maybeSingle(),
      supabase
        .from("pacientes_ficha_enfermagem")
        .select(
          "id, id_paciente, id_agendamento, id_usuario, updated_at, dados, arquivo_termo_assinatura_virtual, pacientes(nome_completo, nome_social), usuarios(nome_completo, usuario)",
        )
        .eq("id_empresa", Number(session.idEmpresa))
        .order("updated_at", { ascending: false })
        .limit(200),
    ]);

    const all = [
      pacientesRes,
      usuariosRes,
      evolRes,
      condRes,
      unhaRes,
      peRes,
      hidRes,
      lesRes,
      fdRes,
      fpRes,
      empresaRes,
      fichasRes,
    ];
    const err = all.find((x) => x.error)?.error;
    if (err) throw new Error(err.message);

    if (Number.isFinite(idUsuarioSessao) && idUsuarioSessao > 0) {
      podeParametrizarAnamnese = await getUsuarioGrupoAdministrativo(supabase, idUsuarioSessao);
    }
    diasEntreAnamnesesInicial = diasEntreAnamnesesDoValorDb(empresaRes.data?.dias_entre_anamneses);
    diasEntreAnamnesesEnfermagemInicial = diasEntreAnamnesesDoValorDb(
      empresaRes.data?.dias_entre_anamneses_enfermagem,
    );
    fichasEnfermagem = (fichasRes.data ?? []).map((f) => {
      const pacRaw = f.pacientes as
        | { nome_completo?: string | null; nome_social?: string | null }
        | { nome_completo?: string | null; nome_social?: string | null }[]
        | null;
      const usuRaw = f.usuarios as
        | { nome_completo?: string | null; usuario?: string | null }
        | { nome_completo?: string | null; usuario?: string | null }[]
        | null;
      const dados = f.dados;
      return {
        id: Number(f.id),
        id_paciente: Number(f.id_paciente),
        id_agendamento: Number(f.id_agendamento),
        id_usuario: Number(f.id_usuario),
        updated_at: String(f.updated_at ?? ""),
        dados: dados && typeof dados === "object" ? (dados as Record<string, unknown>) : null,
        arquivo_termo_assinatura_virtual:
          typeof f.arquivo_termo_assinatura_virtual === "string" && f.arquivo_termo_assinatura_virtual.trim()
            ? f.arquivo_termo_assinatura_virtual.trim()
            : null,
        pacientes: Array.isArray(pacRaw) ? pacRaw[0] ?? null : pacRaw,
        usuarios: Array.isArray(usuRaw) ? usuRaw[0] ?? null : usuRaw,
      };
    });

    pacientes = (pacientesRes.data ?? []).map((p) => ({
      id: Number(p.id),
      nome: nomeExibicaoPaciente({
        nome_completo: p.nome_completo as string | null,
        nome_social: p.nome_social as string | null,
      }),
    }));
    responsaveis = (usuariosRes.data ?? []).map((u) => ({
      id: Number(u.id),
      nome:
        (u.nome_completo && String(u.nome_completo).trim()) ||
        String(u.usuario ?? `Usuário #${u.id}`),
    }));
    evolucoes = (evolRes.data ?? []) as unknown as Record<string, unknown>[];
    condicoes = (condRes.data ?? []) as ItemRef[];
    tiposUnhas = (unhaRes.data ?? []) as ItemRef[];
    tiposPe = (peRes.data ?? []) as ItemRef[];
    hidroses = (hidRes.data ?? []) as ItemRef[];
    lesoes = (lesRes.data ?? []) as ItemRef[];
    formatosDedos = (fdRes.data ?? []) as ItemRef[];
    formatosPe = (fpRes.data ?? []) as ItemRef[];
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Não foi possível carregar dados de avaliações.";
  }

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Avaliações de pacientes</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item"><a href="/inicio">Início</a></li>
                <li className="breadcrumb-item">Pacientes</li>
                <li className="breadcrumb-item active">Avaliações</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <AvaliacoesClient
                loadError={loadError}
                pacientes={pacientes}
                responsaveis={responsaveis}
                evolucoesIniciais={evolucoes}
                condicoes={condicoes}
                tiposUnhas={tiposUnhas}
                tiposPe={tiposPe}
                hidroses={hidroses}
                lesoesMecanicas={lesoes}
                formatosDedos={formatosDedos}
                formatosPe={formatosPe}
                podeParametrizarAnamnese={podeParametrizarAnamnese}
                podeExcluirEvolucaoPacientes={podeParametrizarAnamnese}
                diasEntreAnamnesesInicial={diasEntreAnamnesesInicial}
                diasEntreAnamnesesEnfermagemInicial={diasEntreAnamnesesEnfermagemInicial}
                fichasEnfermagem={fichasEnfermagem}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
