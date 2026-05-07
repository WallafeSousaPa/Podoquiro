import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { nomeExibicaoPaciente } from "@/lib/pacientes";
import { createAdminClient } from "@/lib/supabase/admin";
import { AvaliacoesClient } from "./avaliacoes-client";

type ItemRef = { id: number; tipo?: string | null; condicao?: string | null; ativo: boolean };

export default async function PacientesAvaliacoesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createAdminClient();
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

  try {
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
    ] = await Promise.all([
      supabase.from("pacientes").select("id, nome_completo, nome_social, telefone").order("id", { ascending: false }),
      supabase.from("usuarios").select("id, usuario, nome_completo").eq("ativo", true).order("nome_completo", { ascending: true }),
      supabase
        .from("pacientes_evolucao")
        .select("*, pacientes(id,nome_completo,nome_social,telefone), usuarios(id,usuario,nome_completo)")
        .order("data", { ascending: false })
        .limit(200),
      supabase.from("condicoes_saude").select("id, condicao, ativo").order("condicao", { ascending: true }),
      supabase.from("tipos_unhas").select("id, tipo, ativo").order("tipo", { ascending: true }),
      supabase.from("tipo_pe").select("id, tipo, ativo").order("tipo", { ascending: true }),
      supabase.from("hidroses").select("id, tipo, ativo").order("tipo", { ascending: true }),
      supabase.from("lesoes_mecanicas").select("id, tipo, ativo").order("tipo", { ascending: true }),
      supabase.from("formato_dedos").select("id, tipo, ativo").order("tipo", { ascending: true }),
      supabase.from("formato_pe").select("id, tipo, ativo").order("tipo", { ascending: true }),
    ]);

    const all = [pacientesRes, usuariosRes, evolRes, condRes, unhaRes, peRes, hidRes, lesRes, fdRes, fpRes];
    const err = all.find((x) => x.error)?.error;
    if (err) throw new Error(err.message);

    pacientes = (pacientesRes.data ?? []).map((p) => ({
      id: Number(p.id),
      nome: nomeExibicaoPaciente({
        nome_completo: p.nome_completo as string | null,
        nome_social: p.nome_social as string | null,
        telefone: p.telefone as string | null,
      }),
    }));
    responsaveis = (usuariosRes.data ?? []).map((u) => ({
      id: Number(u.id),
      nome:
        (u.nome_completo && String(u.nome_completo).trim()) ||
        String(u.usuario ?? `Usuário #${u.id}`),
    }));
    evolucoes = (evolRes.data ?? []) as Record<string, unknown>[];
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
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
