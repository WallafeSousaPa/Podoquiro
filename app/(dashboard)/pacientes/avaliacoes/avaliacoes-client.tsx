"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { FORMAS_CONTATO_PACIENTE } from "@/lib/avaliacoes/evolucao";

type OptionItem = { id: number; tipo?: string | null; condicao?: string | null; ativo: boolean };
type PacienteOpt = { id: number; nome: string };
type ResponsavelOpt = { id: number; nome: string };
type Evolucao = Record<string, unknown>;
type CatalogKey =
  | "condicoes-saude"
  | "tipos-unhas"
  | "tipo-pe"
  | "hidroses"
  | "lesoes-mecanicas"
  | "formato-dedos"
  | "formato-pe";

function ModalBackdrop({ children, onBackdropClick }: { children: ReactNode; onBackdropClick: () => void }) {
  return (
    <>
      <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} role="dialog" aria-modal="true">
        {children}
      </div>
      <div className="modal-backdrop fade show" role="presentation" onClick={onBackdropClick} />
    </>
  );
}

function toNullableString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function formatDataHora(v: unknown): string {
  if (typeof v !== "string" || !v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Props = {
  loadError?: string | null;
  pacientes: PacienteOpt[];
  responsaveis: ResponsavelOpt[];
  evolucoesIniciais: Evolucao[];
  condicoes: OptionItem[];
  tiposUnhas: OptionItem[];
  tiposPe: OptionItem[];
  hidroses: OptionItem[];
  lesoesMecanicas: OptionItem[];
  formatosDedos: OptionItem[];
  formatosPe: OptionItem[];
};

export function AvaliacoesClient(props: Props) {
  const router = useRouter();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const [rows, setRows] = useState<Evolucao[]>(props.evolucoesIniciais);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [filtroPaciente, setFiltroPaciente] = useState("");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [menuAuxOpen, setMenuAuxOpen] = useState(false);
  const [consultaRow, setConsultaRow] = useState<Evolucao | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [idPaciente, setIdPaciente] = useState("");
  const [pacienteBusca, setPacienteBusca] = useState("");
  const [pacienteListaAberta, setPacienteListaAberta] = useState(false);
  const [idCondicao, setIdCondicao] = useState("");
  const [pressaoArterial, setPressaoArterial] = useState("");
  const [glicemia, setGlicemia] = useState("");
  const [atividadeFisica, setAtividadeFisica] = useState("");
  const [tipoCalcado, setTipoCalcado] = useState("");
  const [alergias, setAlergias] = useState("");
  const [idTipoUnha, setIdTipoUnha] = useState("");
  const [idPeEsquerdo, setIdPeEsquerdo] = useState("");
  const [idPeDireito, setIdPeDireito] = useState("");
  const [idHidrose, setIdHidrose] = useState("");
  const [idLesoesMecanicas, setIdLesoesMecanicas] = useState("");
  const [digitoPressao, setDigitoPressao] = useState("");
  const [varizes, setVarizes] = useState("");
  const [claudicacao, setClaudicacao] = useState("");
  const [temperatura, setTemperatura] = useState("");
  const [oleo, setOleo] = useState("");
  const [agua, setAgua] = useState("");
  const [observacao, setObservacao] = useState("");
  const [idFormatoDedos, setIdFormatoDedos] = useState("");
  const [idFormatoPe, setIdFormatoPe] = useState("");
  const [formaContato, setFormaContato] = useState("");
  const [tratamentoSugerido, setTratamentoSugerido] = useState("");

  const [fotoPlantarDireito, setFotoPlantarDireito] = useState<File | null>(null);
  const [fotoPlantarEsquerdo, setFotoPlantarEsquerdo] = useState<File | null>(null);
  const [fotoDorsoDireito, setFotoDorsoDireito] = useState<File | null>(null);
  const [fotoDorsoEsquerdo, setFotoDorsoEsquerdo] = useState<File | null>(null);
  const [fotoTermo, setFotoTermo] = useState<File | null>(null);

  const [fotoPlantarDireitoPath, setFotoPlantarDireitoPath] = useState("");
  const [fotoPlantarEsquerdoPath, setFotoPlantarEsquerdoPath] = useState("");
  const [fotoDorsoDireitoPath, setFotoDorsoDireitoPath] = useState("");
  const [fotoDorsoEsquerdoPath, setFotoDorsoEsquerdoPath] = useState("");
  const [fotoTermoPath, setFotoTermoPath] = useState("");

  const [catalogModal, setCatalogModal] = useState<{
    key: CatalogKey;
    title: string;
    items: OptionItem[];
    itemEditingId: number | null;
    text: string;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const pacientesById = useMemo(
    () => Object.fromEntries(props.pacientes.map((p) => [p.id, p.nome])) as Record<number, string>,
    [props.pacientes],
  );
  const responsavelById = useMemo(
    () => Object.fromEntries(props.responsaveis.map((r) => [r.id, r.nome])) as Record<number, string>,
    [props.responsaveis],
  );

  const rowsFiltrados = useMemo(() => {
    const q = filtroPaciente.trim().toLowerCase();
    return rows.filter((r) => {
      const pid = Number(r.id_paciente);
      const nome = pacientesById[pid] ?? "";
      const okPaciente = !q || nome.toLowerCase().includes(q);
      let okData = true;
      if (filtroDataInicio || filtroDataFim) {
        const raw = r.data;
        const d = typeof raw === "string" ? new Date(raw) : new Date(NaN);
        if (!Number.isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const ymd = `${y}-${m}-${day}`;
          if (filtroDataInicio && ymd < filtroDataInicio) okData = false;
          if (filtroDataFim && ymd > filtroDataFim) okData = false;
        }
      }
      return okPaciente && okData;
    });
  }, [rows, filtroPaciente, pacientesById, filtroDataInicio, filtroDataFim]);

  const pacientesFiltradosModal = useMemo(() => {
    const q = pacienteBusca.trim().toLowerCase();
    if (!q) return props.pacientes.slice(0, 40);
    return props.pacientes.filter((p) => p.nome.toLowerCase().includes(q)).slice(0, 60);
  }, [props.pacientes, pacienteBusca]);

  async function reloadList() {
    setLoadingList(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      params.set("incluir_inativos", "1");
      const res = await fetch(`/api/pacientes-evolucao?${params.toString()}`);
      const json = (await res.json()) as { error?: string; data?: Evolucao[] };
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar avaliações.");
      setRows(json.data ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Erro ao carregar avaliações.");
    } finally {
      setLoadingList(false);
    }
  }

  function resetForm() {
    setEditingId(null);
    setIdPaciente("");
    setPacienteBusca("");
    setPacienteListaAberta(false);
    setIdCondicao("");
    setPressaoArterial("");
    setGlicemia("");
    setAtividadeFisica("");
    setTipoCalcado("");
    setAlergias("");
    setIdTipoUnha("");
    setIdPeEsquerdo("");
    setIdPeDireito("");
    setIdHidrose("");
    setIdLesoesMecanicas("");
    setDigitoPressao("");
    setVarizes("");
    setClaudicacao("");
    setTemperatura("");
    setOleo("");
    setAgua("");
    setObservacao("");
    setIdFormatoDedos("");
    setIdFormatoPe("");
    setFormaContato("");
    setTratamentoSugerido("");
    setFotoPlantarDireito(null);
    setFotoPlantarEsquerdo(null);
    setFotoDorsoDireito(null);
    setFotoDorsoEsquerdo(null);
    setFotoTermo(null);
    setFotoPlantarDireitoPath("");
    setFotoPlantarEsquerdoPath("");
    setFotoDorsoDireitoPath("");
    setFotoDorsoEsquerdoPath("");
    setFotoTermoPath("");
    setFormError(null);
  }

  function openCreate() {
    resetForm();
    setModalOpen(true);
  }

  function openEdit(row: Evolucao) {
    resetForm();
    setEditingId(Number(row.id));
    setIdPaciente(String(row.id_paciente ?? ""));
    const pid = Number(row.id_paciente ?? 0);
    setPacienteBusca(pacientesById[pid] ?? "");
    setPacienteListaAberta(false);
    setIdCondicao(String(row.id_condicao ?? ""));
    setPressaoArterial(toNullableString(row.pressao_arterial));
    setGlicemia(toNullableString(row.glicemia));
    setAtividadeFisica(toNullableString(row.atividade_fisica));
    setTipoCalcado(toNullableString(row.tipo_calcado));
    setAlergias(toNullableString(row.alergias));
    setIdTipoUnha(String(row.id_tipo_unha ?? ""));
    setIdPeEsquerdo(String(row.id_pe_esquerdo ?? ""));
    setIdPeDireito(String(row.id_pe_direito ?? ""));
    setIdHidrose(String(row.id_hidrose ?? ""));
    setIdLesoesMecanicas(String(row.id_lesoes_mecanicas ?? ""));
    setDigitoPressao(toNullableString(row.digito_pressao));
    setVarizes(toNullableString(row.varizes));
    setClaudicacao(toNullableString(row.claudicacao));
    setTemperatura(toNullableString(row.temperatura));
    setOleo(toNullableString(row.oleo));
    setAgua(toNullableString(row.agua));
    setObservacao(toNullableString(row.observacao));
    setIdFormatoDedos(String(row.id_formato_dedos ?? ""));
    setIdFormatoPe(String(row.id_formato_pe ?? ""));
    setFormaContato(toNullableString(row.forma_contato));
    setTratamentoSugerido(toNullableString(row.tratamento_sugerido));
    setFotoPlantarDireitoPath(toNullableString(row.foto_plantar_direito));
    setFotoPlantarEsquerdoPath(toNullableString(row.foto_plantar_esquerdo));
    setFotoDorsoDireitoPath(toNullableString(row.foto_dorso_direito));
    setFotoDorsoEsquerdoPath(toNullableString(row.foto_dorso_esquerdo));
    setFotoTermoPath(toNullableString(row.foto_doc_termo_consentimento));
    setModalOpen(true);
  }

  async function submitEvolucao(e: FormEvent) {
    e.preventDefault();
    if (!idPaciente) {
      setFormError("Paciente é obrigatório.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const fd = new FormData();
      const appendText = (k: string, v: string) => fd.append(k, v.trim());
      appendText("id_paciente", idPaciente);
      appendText("id_condicao", idCondicao);
      appendText("pressao_arterial", pressaoArterial);
      appendText("glicemia", glicemia);
      appendText("atividade_fisica", atividadeFisica);
      appendText("tipo_calcado", tipoCalcado);
      appendText("alergias", alergias);
      appendText("id_tipo_unha", idTipoUnha);
      appendText("id_pe_esquerdo", idPeEsquerdo);
      appendText("id_pe_direito", idPeDireito);
      appendText("id_hidrose", idHidrose);
      appendText("id_lesoes_mecanicas", idLesoesMecanicas);
      appendText("digito_pressao", digitoPressao);
      appendText("varizes", varizes);
      appendText("claudicacao", claudicacao);
      appendText("temperatura", temperatura);
      appendText("oleo", oleo);
      appendText("agua", agua);
      appendText("observacao", observacao);
      appendText("id_formato_dedos", idFormatoDedos);
      appendText("id_formato_pe", idFormatoPe);
      appendText("forma_contato", formaContato);
      appendText("tratamento_sugerido", tratamentoSugerido);

      appendText("foto_plantar_direito_path", fotoPlantarDireitoPath);
      appendText("foto_plantar_esquerdo_path", fotoPlantarEsquerdoPath);
      appendText("foto_dorso_direito_path", fotoDorsoDireitoPath);
      appendText("foto_dorso_esquerdo_path", fotoDorsoEsquerdoPath);
      appendText("foto_doc_termo_consentimento_path", fotoTermoPath);

      if (fotoPlantarDireito) fd.append("foto_plantar_direito", fotoPlantarDireito);
      if (fotoPlantarEsquerdo) fd.append("foto_plantar_esquerdo", fotoPlantarEsquerdo);
      if (fotoDorsoDireito) fd.append("foto_dorso_direito", fotoDorsoDireito);
      if (fotoDorsoEsquerdo) fd.append("foto_dorso_esquerdo", fotoDorsoEsquerdo);
      if (fotoTermo) fd.append("foto_doc_termo_consentimento", fotoTermo);

      const url = editingId ? `/api/pacientes-evolucao/${editingId}` : "/api/pacientes-evolucao";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, { method, body: fd });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar avaliação.");
      setModalOpen(false);
      resetForm();
      await reloadList();
      router.refresh();
    } catch (e2) {
      setFormError(e2 instanceof Error ? e2.message : "Erro ao salvar avaliação.");
    } finally {
      setSaving(false);
    }
  }

  function selecionarPacienteModal(p: PacienteOpt) {
    setIdPaciente(String(p.id));
    setPacienteBusca(p.nome);
    setPacienteListaAberta(false);
  }

  function urlFotoPublica(path: unknown): string | null {
    if (typeof path !== "string" || !path.trim() || !supabaseUrl) return null;
    return `${supabaseUrl}/storage/v1/object/public/evolucao_analise/${path}`;
  }

  async function toggleAtivo(row: Evolucao, ativo: boolean) {
    setListError(null);
    const res = await fetch(`/api/pacientes-evolucao/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setListError(json.error ?? "Erro ao alterar status.");
      return;
    }
    await reloadList();
  }

  const catalogConfigs = useMemo(
    () => [
      { key: "condicoes-saude" as const, title: "Condições de saúde", items: props.condicoes, field: "condicao" as const },
      { key: "tipos-unhas" as const, title: "Tipos de unhas", items: props.tiposUnhas, field: "tipo" as const },
      { key: "tipo-pe" as const, title: "Tipo de pé", items: props.tiposPe, field: "tipo" as const },
      { key: "hidroses" as const, title: "Hidroses", items: props.hidroses, field: "tipo" as const },
      { key: "lesoes-mecanicas" as const, title: "Lesões mecânicas", items: props.lesoesMecanicas, field: "tipo" as const },
      { key: "formato-dedos" as const, title: "Formato dos dedos", items: props.formatosDedos, field: "tipo" as const },
      { key: "formato-pe" as const, title: "Formato do pé", items: props.formatosPe, field: "tipo" as const },
    ],
    [props.condicoes, props.formatosDedos, props.formatosPe, props.hidroses, props.lesoesMecanicas, props.tiposPe, props.tiposUnhas],
  );

  function openCatalog(cfg: (typeof catalogConfigs)[number]) {
    setCatalogModal({
      key: cfg.key,
      title: cfg.title,
      items: cfg.items,
      itemEditingId: null,
      text: "",
      loading: false,
      error: null,
    });
  }

  async function refreshCatalog(key: CatalogKey) {
    const res = await fetch(`/api/${key}?incluir_inativos=1`);
    const json = (await res.json()) as { error?: string; data?: OptionItem[] };
    if (!res.ok) throw new Error(json.error ?? "Erro ao carregar cadastro auxiliar.");
    if (catalogModal && catalogModal.key === key) {
      setCatalogModal({ ...catalogModal, items: json.data ?? [] });
    }
  }

  async function saveCatalogItem() {
    if (!catalogModal) return;
    setCatalogModal({ ...catalogModal, loading: true, error: null });
    try {
      const field = catalogModal.key === "condicoes-saude" ? "condicao" : "tipo";
      const payload = { [field]: catalogModal.text };
      const url = catalogModal.itemEditingId ? `/api/${catalogModal.key}/${catalogModal.itemEditingId}` : `/api/${catalogModal.key}`;
      const method = catalogModal.itemEditingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar.");
      await refreshCatalog(catalogModal.key);
      setCatalogModal((prev) => (prev ? { ...prev, itemEditingId: null, text: "", loading: false } : prev));
      router.refresh();
    } catch (e) {
      setCatalogModal((prev) => (prev ? { ...prev, loading: false, error: e instanceof Error ? e.message : "Erro." } : prev));
    }
  }

  async function toggleCatalogItem(item: OptionItem, ativo: boolean) {
    if (!catalogModal) return;
    const field = catalogModal.key === "condicoes-saude" ? "condicao" : "tipo";
    const text = (item[field] as string | null) ?? "";
    const res = await fetch(`/api/${catalogModal.key}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: text, ativo }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setCatalogModal({ ...catalogModal, error: json.error ?? "Erro ao alterar status." });
      return;
    }
    await refreshCatalog(catalogModal.key);
    router.refresh();
  }

  useEffect(() => {
    setRows(props.evolucoesIniciais);
  }, [props.evolucoesIniciais]);

  if (props.loadError) {
    return <div className="alert alert-danger">{props.loadError}</div>;
  }

  return (
    <>
      {listError ? <div className="alert alert-warning">{listError}</div> : null}
      <div className="card card-outline card-primary">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center">
          <h3 className="card-title mb-2 mb-sm-0">Evolução dos pacientes</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
            <i className="fas fa-plus mr-1" aria-hidden /> Nova avaliação
          </button>
        </div>
        <div className="card-body border-bottom">
          <div className="form-row">
            <div className="form-group col-md-4 mb-2 mb-md-0">
              <label className="mb-1">Consultar por paciente</label>
              <input className="form-control" value={filtroPaciente} onChange={(e) => setFiltroPaciente(e.target.value)} placeholder="Digite parte do nome..." />
            </div>
            <div className="form-group col-md-2 mb-2 mb-md-0">
              <label className="mb-1">Data inicial</label>
              <input
                type="date"
                className="form-control"
                value={filtroDataInicio}
                onChange={(e) => setFiltroDataInicio(e.target.value)}
              />
            </div>
            <div className="form-group col-md-2 mb-2 mb-md-0">
              <label className="mb-1">Data final</label>
              <input
                type="date"
                className="form-control"
                value={filtroDataFim}
                onChange={(e) => setFiltroDataFim(e.target.value)}
              />
            </div>
            <div className="form-group col-md-4 mb-0 d-flex align-items-end">
              <div className="w-100">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm btn-block text-left"
                  onClick={() => setMenuAuxOpen((v) => !v)}
                  aria-expanded={menuAuxOpen}
                >
                  <i className={`fas ${menuAuxOpen ? "fa-angle-down" : "fa-angle-right"} mr-1`} aria-hidden />
                  Cadastros auxiliares
                </button>
                {menuAuxOpen ? (
                  <div className="border rounded mt-2 p-2 bg-light">
                    <div className="d-flex flex-wrap" style={{ gap: 8 }}>
                      {catalogConfigs.map((cfg) => (
                        <button key={cfg.key} type="button" className="btn btn-outline-secondary btn-sm" onClick={() => openCatalog(cfg)}>
                          {cfg.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="card-body table-responsive p-0" style={{ maxHeight: "min(55vh, 560px)" }}>
          <table className="table table-striped table-hover mb-0">
            <thead className="text-nowrap" style={{ position: "sticky", top: 0, zIndex: 2, backgroundColor: "#fff" }}>
              <tr>
                <th>ID</th>
                <th>Paciente</th>
                <th>Responsável</th>
                <th>Condição</th>
                <th>Data</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr><td colSpan={7} className="text-center py-4 text-muted">Carregando...</td></tr>
              ) : rowsFiltrados.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-4 text-muted">Nenhuma avaliação encontrada.</td></tr>
              ) : rowsFiltrados.map((row) => {
                const pid = Number(row.id_paciente);
                const uid = Number(row.id_responsavel);
                return (
                  <tr key={String(row.id)}>
                    <td>{String(row.id)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-link p-0 align-baseline"
                        onClick={() => setConsultaRow(row)}
                        title="Consultar avaliação"
                      >
                        {pacientesById[pid] ?? `Paciente #${pid}`}
                      </button>
                    </td>
                    <td>{responsavelById[uid] ?? `Usuário #${uid}`}</td>
                    <td>{String(row.id_condicao ?? "-")}</td>
                    <td>{formatDataHora(row.data)}</td>
                    <td>{row.ativo === false ? <span className="badge badge-secondary">Inativo</span> : <span className="badge badge-success">Ativo</span>}</td>
                    <td className="text-right text-nowrap">
                      <button className="btn btn-sm btn-outline-primary mr-1" onClick={() => openEdit(row)}>
                        <i className="fas fa-edit" aria-hidden /> Editar
                      </button>
                      {row.ativo === false ? (
                        <button className="btn btn-sm btn-outline-success" onClick={() => void toggleAtivo(row, true)}>Ativar</button>
                      ) : (
                        <button className="btn btn-sm btn-outline-danger" onClick={() => void toggleAtivo(row, false)}>Inativar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <ModalBackdrop onBackdropClick={() => !saving && setModalOpen(false)}>
          <div
            className="modal-dialog modal-xl modal-dialog-centered"
            role="document"
            style={{ width: "calc(100% - 1rem)", maxWidth: "min(1140px, calc(100vw - 1rem))", margin: "0.5rem auto" }}
          >
            <div className="modal-content">
              <form onSubmit={(e) => void submitEvolucao(e)}>
                <div className="modal-header">
                  <h5 className="modal-title">{editingId ? "Editar avaliação" : "Nova avaliação"}</h5>
                  <button type="button" className="close" onClick={() => setModalOpen(false)}><span aria-hidden="true">&times;</span></button>
                </div>
                <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
                  {formError ? <div className="alert alert-danger py-2 small">{formError}</div> : null}
                  <div className="form-row">
                    <div className="form-group col-md-12">
                      <label htmlFor="avaliacao-paciente-busca">Paciente</label>
                      <div className="position-relative">
                        <input
                          id="avaliacao-paciente-busca"
                          type="search"
                          className="form-control"
                          placeholder="Digite para buscar paciente..."
                          autoComplete="off"
                          value={pacienteBusca}
                          onChange={(e) => {
                            setPacienteBusca(e.target.value);
                            setIdPaciente("");
                            setPacienteListaAberta(true);
                          }}
                          onFocus={() => setPacienteListaAberta(true)}
                          onBlur={() => window.setTimeout(() => setPacienteListaAberta(false), 200)}
                          required
                        />
                        {pacienteListaAberta ? (
                          <ul
                            className="list-group position-absolute w-100"
                            style={{ zIndex: 30, maxHeight: 220, overflowY: "auto" }}
                            role="listbox"
                          >
                            {pacientesFiltradosModal.length === 0 ? (
                              <li className="list-group-item text-muted small">Nenhum paciente encontrado.</li>
                            ) : (
                              pacientesFiltradosModal.map((p) => (
                                <li key={p.id} className="list-group-item p-0" role="presentation">
                                  <button
                                    type="button"
                                    className="btn btn-link text-left w-100"
                                    onMouseDown={(ev) => ev.preventDefault()}
                                    onClick={() => selecionarPacienteModal(p)}
                                  >
                                    {p.nome}
                                  </button>
                                </li>
                              ))
                            )}
                          </ul>
                        ) : null}
                      </div>
                      {idPaciente ? (
                        <small className="form-text text-success">Paciente selecionado.</small>
                      ) : (
                        <small className="form-text text-muted">Escolha um paciente na lista.</small>
                      )}
                    </div>
                  </div>
                  <div className="border rounded p-3 mb-3">
                    <h6 className="text-primary mb-3">Informações de saúde do paciente</h6>
                    <div className="form-row">
                      <div className="form-group col-md-4"><label>Condição de saúde</label><select className="form-control" value={idCondicao} onChange={(e) => setIdCondicao(e.target.value)}><option value="">—</option>{props.condicoes.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.condicao}</option>)}</select></div>
                      <div className="form-group col-md-4"><label>Pressão arterial</label><input className="form-control" value={pressaoArterial} onChange={(e) => setPressaoArterial(e.target.value)} /></div>
                      <div className="form-group col-md-4"><label>Glicemia</label><input className="form-control" value={glicemia} onChange={(e) => setGlicemia(e.target.value)} /></div>
                    </div>
                    <div className="form-row">
                      <div className="form-group col-md-6"><label>Atividade física</label><input className="form-control" value={atividadeFisica} onChange={(e) => setAtividadeFisica(e.target.value)} /></div>
                      <div className="form-group col-md-6"><label>Tipo de calçado</label><input className="form-control" value={tipoCalcado} onChange={(e) => setTipoCalcado(e.target.value)} /></div>
                    </div>
                    <div className="form-row">
                      <div className="form-group col-md-4"><label>Varizes</label><input className="form-control" value={varizes} onChange={(e) => setVarizes(e.target.value)} /></div>
                      <div className="form-group col-md-4"><label>Claudicação</label><input className="form-control" value={claudicacao} onChange={(e) => setClaudicacao(e.target.value)} /></div>
                      <div className="form-group col-md-4"><label>Alergias</label><input className="form-control" value={alergias} onChange={(e) => setAlergias(e.target.value)} /></div>
                    </div>
                  </div>

                  <div className="border rounded p-3 mb-3">
                    <h6 className="text-primary mb-3">Tipos de unhas</h6>
                    <div className="form-row">
                      <div className="form-group col-md-4"><label>Tipo de unha</label><select className="form-control" value={idTipoUnha} onChange={(e) => setIdTipoUnha(e.target.value)}><option value="">—</option>{props.tiposUnhas.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.tipo}</option>)}</select></div>
                      <div className="form-group col-md-4"><label>Pé esquerdo</label><select className="form-control" value={idPeEsquerdo} onChange={(e) => setIdPeEsquerdo(e.target.value)}><option value="">—</option>{props.tiposPe.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.tipo}</option>)}</select></div>
                      <div className="form-group col-md-4"><label>Pé direito</label><select className="form-control" value={idPeDireito} onChange={(e) => setIdPeDireito(e.target.value)}><option value="">—</option>{props.tiposPe.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.tipo}</option>)}</select></div>
                    </div>
                  </div>

                  <div className="border rounded p-3 mb-3">
                    <h6 className="text-primary mb-3">Analise Clinica</h6>
                    <div className="form-row">
                      <div className="form-group col-md-6"><label>Hidrose</label><select className="form-control" value={idHidrose} onChange={(e) => setIdHidrose(e.target.value)}><option value="">—</option>{props.hidroses.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.tipo}</option>)}</select></div>
                      <div className="form-group col-md-6"><label>Lesões mecânicas</label><select className="form-control" value={idLesoesMecanicas} onChange={(e) => setIdLesoesMecanicas(e.target.value)}><option value="">—</option>{props.lesoesMecanicas.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.tipo}</option>)}</select></div>
                    </div>
                    <div className="form-row">
                      <div className="form-group col-md-4"><label>Dígito pressão</label><input className="form-control" value={digitoPressao} onChange={(e) => setDigitoPressao(e.target.value)} /></div>
                      <div className="form-group col-md-4"><label>Temperatura</label><input className="form-control" value={temperatura} onChange={(e) => setTemperatura(e.target.value)} /></div>
                      <div className="form-group col-md-4"><label>Óleo</label><input className="form-control" value={oleo} onChange={(e) => setOleo(e.target.value)} /></div>
                    </div>
                    <div className="form-row">
                      <div className="form-group col-md-4"><label>Água</label><input className="form-control" value={agua} onChange={(e) => setAgua(e.target.value)} /></div>
                      <div className="form-group col-md-4"><label>Formato dos dedos</label><select className="form-control" value={idFormatoDedos} onChange={(e) => setIdFormatoDedos(e.target.value)}><option value="">—</option>{props.formatosDedos.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.tipo}</option>)}</select></div>
                      <div className="form-group col-md-4"><label>Formato do pé</label><select className="form-control" value={idFormatoPe} onChange={(e) => setIdFormatoPe(e.target.value)}><option value="">—</option>{props.formatosPe.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.tipo}</option>)}</select></div>
                    </div>
                    <div className="form-row">
                      <div className="form-group col-md-6"><label>Forma de contato</label><select className="form-control" value={formaContato} onChange={(e) => setFormaContato(e.target.value)}><option value="">—</option>{FORMAS_CONTATO_PACIENTE.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
                      <div className="form-group col-md-6"><label>Tratamento sugerido</label><input className="form-control" value={tratamentoSugerido} onChange={(e) => setTratamentoSugerido(e.target.value)} /></div>
                    </div>
                    <div className="form-group mb-0"><label>Observação</label><textarea className="form-control" rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} /></div>
                  </div>

                  <div className="border rounded p-3">
                    <h6 className="text-primary mb-3">Analise visual</h6>
                  <div className="form-row">
                    <div className="form-group col-md-6"><label>Plantar direito</label><input type="file" className="form-control-file" accept="image/*" onChange={(e) => setFotoPlantarDireito(e.target.files?.[0] ?? null)} />{fotoPlantarDireitoPath ? <small className="text-muted d-block">{fotoPlantarDireitoPath}</small> : null}</div>
                    <div className="form-group col-md-6"><label>Plantar esquerdo</label><input type="file" className="form-control-file" accept="image/*" onChange={(e) => setFotoPlantarEsquerdo(e.target.files?.[0] ?? null)} />{fotoPlantarEsquerdoPath ? <small className="text-muted d-block">{fotoPlantarEsquerdoPath}</small> : null}</div>
                  </div>
                  <div className="form-row">
                    <div className="form-group col-md-6"><label>Dorso direito</label><input type="file" className="form-control-file" accept="image/*" onChange={(e) => setFotoDorsoDireito(e.target.files?.[0] ?? null)} />{fotoDorsoDireitoPath ? <small className="text-muted d-block">{fotoDorsoDireitoPath}</small> : null}</div>
                    <div className="form-group col-md-6"><label>Dorso esquerdo</label><input type="file" className="form-control-file" accept="image/*" onChange={(e) => setFotoDorsoEsquerdo(e.target.files?.[0] ?? null)} />{fotoDorsoEsquerdoPath ? <small className="text-muted d-block">{fotoDorsoEsquerdoPath}</small> : null}</div>
                  </div>
                  <div className="form-group mb-0"><label>Doc. termo consentimento</label><input type="file" className="form-control-file" accept="image/*" onChange={(e) => setFotoTermo(e.target.files?.[0] ?? null)} />{fotoTermoPath ? <small className="text-muted d-block">{fotoTermoPath}</small> : null}</div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
                </div>
              </form>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {catalogModal ? (
        <ModalBackdrop onBackdropClick={() => setCatalogModal(null)}>
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{catalogModal.title}</h5>
                <button type="button" className="close" onClick={() => setCatalogModal(null)}><span aria-hidden="true">&times;</span></button>
              </div>
              <div className="modal-body">
                {catalogModal.error ? <div className="alert alert-warning py-2 small">{catalogModal.error}</div> : null}
                <div className="input-group mb-3">
                  <input
                    className="form-control"
                    value={catalogModal.text}
                    onChange={(e) => setCatalogModal({ ...catalogModal, text: e.target.value })}
                    placeholder={catalogModal.key === "condicoes-saude" ? "Condição..." : "Tipo..."}
                  />
                  <div className="input-group-append">
                    <button className="btn btn-primary" type="button" disabled={catalogModal.loading} onClick={() => void saveCatalogItem()}>
                      {catalogModal.itemEditingId ? "Salvar edição" : "Cadastrar"}
                    </button>
                  </div>
                </div>
                <div className="table-responsive" style={{ maxHeight: "320px" }}>
                  <table className="table table-sm table-striped mb-0">
                    <thead><tr><th>Descrição</th><th>Status</th><th className="text-right">Ações</th></tr></thead>
                    <tbody>
                      {catalogModal.items.map((item) => {
                        const field = catalogModal.key === "condicoes-saude" ? item.condicao : item.tipo;
                        return (
                          <tr key={item.id}>
                            <td>{field ?? "-"}</td>
                            <td>{item.ativo ? <span className="badge badge-success">Ativo</span> : <span className="badge badge-secondary">Inativo</span>}</td>
                            <td className="text-right">
                              <button
                                className="btn btn-sm btn-outline-primary mr-1"
                                type="button"
                                onClick={() =>
                                  setCatalogModal({
                                    ...catalogModal,
                                    itemEditingId: item.id,
                                    text: String(field ?? ""),
                                  })
                                }
                              >
                                Editar
                              </button>
                              {item.ativo ? (
                                <button className="btn btn-sm btn-outline-danger" type="button" onClick={() => void toggleCatalogItem(item, false)}>Inativar</button>
                              ) : (
                                <button className="btn btn-sm btn-outline-success" type="button" onClick={() => void toggleCatalogItem(item, true)}>Ativar</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {consultaRow ? (
        <ModalBackdrop onBackdropClick={() => setConsultaRow(null)}>
          <div className="modal-dialog modal-xl modal-dialog-centered" role="document" style={{ width: "calc(100% - 1rem)", maxWidth: "min(1140px, calc(100vw - 1rem))", margin: "0.5rem auto" }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Consulta da avaliação</h5>
                <button type="button" className="close" onClick={() => setConsultaRow(null)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
                <div className="form-row">
                  <div className="form-group col-md-6">
                    <label className="mb-1 text-muted">Paciente</label>
                    <div className="font-weight-bold">{pacientesById[Number(consultaRow.id_paciente)] ?? `Paciente #${consultaRow.id_paciente}`}</div>
                  </div>
                  <div className="form-group col-md-6">
                    <label className="mb-1 text-muted">Responsável</label>
                    <div className="font-weight-bold">{responsavelById[Number(consultaRow.id_responsavel)] ?? `Usuário #${consultaRow.id_responsavel}`}</div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-3">
                    <label className="mb-1 text-muted">ID Avaliação</label>
                    <div>{String(consultaRow.id ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-3">
                    <label className="mb-1 text-muted">ID Paciente</label>
                    <div>{String(consultaRow.id_paciente ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-3">
                    <label className="mb-1 text-muted">ID Responsável</label>
                    <div>{String(consultaRow.id_responsavel ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-3">
                    <label className="mb-1 text-muted">ID Condição</label>
                    <div>{String(consultaRow.id_condicao ?? "-")}</div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Data</label>
                    <div>{formatDataHora(consultaRow.data)}</div>
                  </div>
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Forma de contato</label>
                    <div>{String(consultaRow.forma_contato ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Status</label>
                    <div>{consultaRow.ativo === false ? "Inativo" : "Ativo"}</div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Pressão arterial</label>
                    <div>{String(consultaRow.pressao_arterial ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Glicemia</label>
                    <div>{String(consultaRow.glicemia ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Atividade física</label>
                    <div>{String(consultaRow.atividade_fisica ?? "-")}</div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Tipo calçado</label>
                    <div>{String(consultaRow.tipo_calcado ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Alergias</label>
                    <div>{String(consultaRow.alergias ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Dígito pressão</label>
                    <div>{String(consultaRow.digito_pressao ?? "-")}</div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Varizes</label>
                    <div>{String(consultaRow.varizes ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Claudicação</label>
                    <div>{String(consultaRow.claudicacao ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Temperatura</label>
                    <div>{String(consultaRow.temperatura ?? "-")}</div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Óleo</label>
                    <div>{String(consultaRow.oleo ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Água</label>
                    <div>{String(consultaRow.agua ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">Tratamento sugerido</label>
                    <div>{String(consultaRow.tratamento_sugerido ?? "-")}</div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-3">
                    <label className="mb-1 text-muted">ID Tipo unha</label>
                    <div>{String(consultaRow.id_tipo_unha ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-3">
                    <label className="mb-1 text-muted">ID Pé esquerdo</label>
                    <div>{String(consultaRow.id_pe_esquerdo ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-3">
                    <label className="mb-1 text-muted">ID Pé direito</label>
                    <div>{String(consultaRow.id_pe_direito ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-3">
                    <label className="mb-1 text-muted">ID Hidrose</label>
                    <div>{String(consultaRow.id_hidrose ?? "-")}</div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">ID Lesões mecânicas</label>
                    <div>{String(consultaRow.id_lesoes_mecanicas ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">ID Formato dedos</label>
                    <div>{String(consultaRow.id_formato_dedos ?? "-")}</div>
                  </div>
                  <div className="form-group col-md-4">
                    <label className="mb-1 text-muted">ID Formato pé</label>
                    <div>{String(consultaRow.id_formato_pe ?? "-")}</div>
                  </div>
                </div>
                <div className="form-group">
                  <label className="mb-1 text-muted">Observação</label>
                  <div>{String(consultaRow.observacao ?? "-")}</div>
                </div>

                <hr />
                <h6 className="text-primary mb-3">Fotos</h6>
                <div className="row">
                  {[
                    { label: "Plantar direito", path: consultaRow.foto_plantar_direito },
                    { label: "Plantar esquerdo", path: consultaRow.foto_plantar_esquerdo },
                    { label: "Dorso direito", path: consultaRow.foto_dorso_direito },
                    { label: "Dorso esquerdo", path: consultaRow.foto_dorso_esquerdo },
                    { label: "Termo consentimento", path: consultaRow.foto_doc_termo_consentimento },
                  ].map((foto) => {
                    const src = urlFotoPublica(foto.path);
                    return (
                      <div key={foto.label} className="col-12 col-sm-6 col-lg-4 mb-3">
                        <div className="border rounded p-2 h-100">
                          <div className="small text-muted mb-2">{foto.label}</div>
                          {src ? (
                            <>
                              <img src={src} alt={foto.label} className="img-fluid rounded border" style={{ width: "100%", maxHeight: 220, objectFit: "cover" }} />
                              <a href={src} target="_blank" rel="noreferrer" className="btn btn-link btn-sm p-0 mt-2">
                                Abrir imagem
                              </a>
                            </>
                          ) : (
                            <div className="text-muted small">Sem foto.</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setConsultaRow(null)}>Fechar</button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </>
  );
}
