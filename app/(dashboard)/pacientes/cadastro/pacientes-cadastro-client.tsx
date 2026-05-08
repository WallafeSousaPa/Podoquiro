"use client";

import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  isCpfLengthOk,
  PACIENTE_ESTADOS_CIVIS,
  PACIENTE_GENEROS,
  normalizeCpfDigits,
} from "@/lib/pacientes";

type PacienteItem = {
  id: number;
  cpf: string | null;
  nome_completo: string | null;
  nome_social: string | null;
  nome_exibicao: string;
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

function ModalBackdrop({
  children,
  onBackdropClick,
}: {
  children: ReactNode;
  onBackdropClick: () => void;
}) {
  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block" }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
      <div
        className="modal-backdrop fade show"
        role="presentation"
        onClick={onBackdropClick}
      />
    </>
  );
}

function formatCpfExibicao(digits: string | null | undefined): string {
  if (digits == null || digits === "") return "-";
  const d = normalizeCpfDigits(digits);
  if (d.length !== 11) return digits.trim() || "-";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatDataBr(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function normalizeCepDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 8);
}

function formatCepInput(digits: string): string {
  const d = digits.slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

type Props = {
  pacientes: PacienteItem[];
  loadError?: string | null;
};

export function PacientesCadastroClient({ pacientes, loadError }: Props) {
  const router = useRouter();
  const modalTitleId = useId();
  const confirmTitleId = useId();
  const filtroNomeEmailId = useId();
  const filtroCpfId = useId();
  const filtroTelefoneId = useId();
  const filtroCidadeId = useId();

  const [rows, setRows] = useState(pacientes);
  useEffect(() => {
    setRows(pacientes);
  }, [pacientes]);

  /** Busca por nome ou e-mail (texto livre). */
  const [filtroNomeEmail, setFiltroNomeEmail] = useState("");
  const [filtroCpf, setFiltroCpf] = useState("");
  const [filtroTelefone, setFiltroTelefone] = useState("");
  const [filtroCidade, setFiltroCidade] = useState("");

  const filtrados = useMemo(() => {
    const nomeEmail = filtroNomeEmail.trim().toLowerCase();
    const cpfDig = normalizeCpfDigits(filtroCpf);
    const telDig = normalizeCpfDigits(filtroTelefone);
    const cidade = filtroCidade.trim().toLowerCase();

    return rows.filter((r) => {
      if (nomeEmail) {
        const okNome = r.nome_exibicao.toLowerCase().includes(nomeEmail);
        const okEmail = r.email?.toLowerCase().includes(nomeEmail) ?? false;
        if (!okNome && !okEmail) return false;
      }
      if (cpfDig) {
        if (!r.cpf?.includes(cpfDig)) return false;
      }
      if (telDig) {
        if (!normalizeCpfDigits(r.telefone).includes(telDig)) return false;
      }
      if (cidade) {
        if (!r.cidade?.toLowerCase().includes(cidade)) return false;
      }
      return true;
    });
  }, [rows, filtroNomeEmail, filtroCpf, filtroTelefone, filtroCidade]);

  type TamanhoPagina = 10 | 20 | 30 | 40 | 50 | "all";
  const [tamanhoPagina, setTamanhoPagina] = useState<TamanhoPagina>(10);
  const [paginaAtual, setPaginaAtual] = useState(1);

  useEffect(() => {
    setPaginaAtual(1);
  }, [filtroNomeEmail, filtroCpf, filtroTelefone, filtroCidade]);

  const { visiveis, totalPaginas, paginaEfetiva, inicioExib, fimExib, totalFiltrados } =
    useMemo(() => {
      const n = filtrados.length;
      if (n === 0) {
        return {
          visiveis: [] as PacienteItem[],
          totalPaginas: 1,
          paginaEfetiva: 1,
          inicioExib: 0,
          fimExib: 0,
          totalFiltrados: 0,
        };
      }
      if (tamanhoPagina === "all") {
        return {
          visiveis: filtrados,
          totalPaginas: 1,
          paginaEfetiva: 1,
          inicioExib: 1,
          fimExib: n,
          totalFiltrados: n,
        };
      }
      const size = tamanhoPagina;
      const totalP = Math.max(1, Math.ceil(n / size));
      const pag = Math.min(Math.max(1, paginaAtual), totalP);
      const start = (pag - 1) * size;
      const slice = filtrados.slice(start, start + size);
      return {
        visiveis: slice,
        totalPaginas: totalP,
        paginaEfetiva: pag,
        inicioExib: start + 1,
        fimExib: start + slice.length,
        totalFiltrados: n,
      };
    }, [filtrados, tamanhoPagina, paginaAtual]);

  useEffect(() => {
    if (tamanhoPagina === "all") return;
    setPaginaAtual((p) => Math.min(p, totalPaginas));
  }, [totalPaginas, tamanhoPagina]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PacienteItem | null>(null);
  const [cpf, setCpf] = useState("");
  const [nomePrincipal, setNomePrincipal] = useState("");
  const [usarNomeSocial, setUsarNomeSocial] = useState(false);
  const [genero, setGenero] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [estadoCivil, setEstadoCivil] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [cepBuscando, setCepBuscando] = useState(false);
  const [cepMensagem, setCepMensagem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [avisoEdicaoCadastro, setAvisoEdicaoCadastro] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{
    row: PacienteItem;
    acao: "ativar" | "inativar";
  } | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; message: string } | null>(
    null,
  );
  const fileImportRef = useRef<HTMLInputElement>(null);
  const abriuModalViaQueryRef = useRef(false);
  /** Garante que nada (cache/autofill/extensão) marque o CPF como obrigatório no DOM. */
  const pacienteCpfInputRef = useRef<HTMLInputElement | null>(null);
  const [importandoArquivo, setImportandoArquivo] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<{
    importados: number;
    ignorados: { linha: number; motivo: string }[];
    mensagem: string;
  } | null>(null);

  function resetForm() {
    setEditing(null);
    setCpf("");
    setNomePrincipal("");
    setUsarNomeSocial(false);
    setGenero("");
    setDataNascimento("");
    setEstadoCivil("");
    setEmail("");
    setTelefone("");
    setCep("");
    setLogradouro("");
    setNumero("");
    setComplemento("");
    setBairro("");
    setCidade("");
    setUf("");
    setCepMensagem(null);
    setCepBuscando(false);
    setFormError(null);
    setAvisoEdicaoCadastro(null);
  }

  function clearCpfCampoValidacaoNativa() {
    const el = pacienteCpfInputRef.current;
    if (!el) return;
    el.required = false;
    el.removeAttribute("required");
    el.removeAttribute("pattern");
    el.setCustomValidity("");
  }

  useLayoutEffect(() => {
    if (!modalOpen) return;
    queueMicrotask(() => {
      clearCpfCampoValidacaoNativa();
    });
  }, [modalOpen]);

  useEffect(() => {
    if (abriuModalViaQueryRef.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("novo") !== "1") return;

    abriuModalViaQueryRef.current = true;
    openCreate();
    router.replace("/pacientes/cadastro");
  }, [router]);

  function openCreate() {
    resetForm();
    setModalOpen(true);
  }

  function openEdit(row: PacienteItem) {
    setEditing(row);
    setCpf(normalizeCpfDigits(row.cpf ?? ""));
    const nc = row.nome_completo?.trim();
    const ns = row.nome_social?.trim();
    if (nc) {
      setUsarNomeSocial(false);
      setNomePrincipal(nc);
    } else {
      setUsarNomeSocial(true);
      setNomePrincipal(ns ?? "");
    }
    setGenero(row.genero ?? "");
    setDataNascimento(row.data_nascimento ?? "");
    setEstadoCivil(row.estado_civil ?? "");
    setEmail(row.email ?? "");
    setTelefone(row.telefone ?? "");
    setCep(normalizeCepDigits(row.cep ?? ""));
    setLogradouro(row.logradouro ?? "");
    setNumero(row.numero ?? "");
    setComplemento(row.complemento ?? "");
    setBairro(row.bairro ?? "");
    setCidade(row.cidade ?? "");
    setUf(row.uf ?? "");
    setCepMensagem(null);
    setCepBuscando(false);
    setFormError(null);

    const cpfDig = normalizeCpfDigits(row.cpf ?? "");
    const cpfPreenchido = cpfDig.length > 0;
    const cpfOk = isCpfLengthOk(cpfDig);
    const telOk = Boolean(row.telefone?.trim());
    if (cpfPreenchido && !cpfOk && !telOk) {
      setAvisoEdicaoCadastro(
        "Este paciente está sem CPF válido (11 dígitos) e sem telefone. Preencha CPF e telefone para concluir o cadastro.",
      );
    } else if (cpfPreenchido && !cpfOk) {
      setAvisoEdicaoCadastro(
        "Este paciente está com CPF inválido (11 dígitos). Corrija o CPF ou deixe o campo em branco.",
      );
    } else if (!telOk) {
      setAvisoEdicaoCadastro(
        "Este paciente está sem telefone. Preencha o telefone de contato.",
      );
    } else {
      setAvisoEdicaoCadastro(null);
    }

    setModalOpen(true);
  }

  useEffect(() => {
    if (!editing) return;
    const cpfOk = isCpfLengthOk(normalizeCpfDigits(cpf));
    const telOk = Boolean(telefone.trim());
    if (cpfOk && telOk) setAvisoEdicaoCadastro(null);
  }, [editing, cpf, telefone]);

  function closeModal() {
    setModalOpen(false);
    resetForm();
  }

  function onCpfChange(v: string) {
    const d = normalizeCpfDigits(v).slice(0, 11);
    setCpf(d);
  }

  function onCepChange(v: string) {
    setCepMensagem(null);
    setCep(normalizeCepDigits(v));
  }

  async function buscarCepPeloEndereco(options?: { avisarSeIncompleto?: boolean }) {
    const d = normalizeCepDigits(cep);
    setCepMensagem(null);
    if (d.length !== 8) {
      if (options?.avisarSeIncompleto) {
        setCepMensagem("Digite o CEP com 8 dígitos para buscar o endereço.");
      }
      return;
    }
    setCepBuscando(true);
    try {
      const res = await fetch(`/api/cep/${d}`);
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        logradouro?: string;
        bairro?: string;
        cidade?: string;
        uf?: string;
      };
      if (!res.ok) {
        setCepMensagem(json.error ?? "CEP não encontrado.");
        return;
      }
      setLogradouro(json.logradouro ?? "");
      setBairro(json.bairro ?? "");
      setCidade(json.cidade ?? "");
      setUf((json.uf ?? "").toUpperCase().slice(0, 2));
      setCepMensagem("Endereço preenchido a partir do CEP.");
    } catch {
      setCepMensagem("Não foi possível buscar o CEP. Verifique a conexão.");
    } finally {
      setCepBuscando(false);
    }
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const cpfDigits = normalizeCpfDigits(cpf);
    if (cpfDigits.length !== 0 && cpfDigits.length !== 11) {
      setFormError("Informe um CPF com 11 dígitos ou deixe o campo em branco.");
      return;
    }
    const tel = telefone.trim();
    if (!tel) {
      setFormError("Informe o telefone.");
      return;
    }
    const nome = nomePrincipal.trim();
    if (!nome) {
      setFormError(usarNomeSocial ? "Informe o nome social." : "Informe o nome completo.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        cpf: cpfDigits.length === 11 ? cpfDigits : "",
        usar_nome_social: usarNomeSocial,
        nome_completo: usarNomeSocial ? null : nome,
        nome_social: usarNomeSocial ? nome : null,
        genero: genero || null,
        data_nascimento: dataNascimento.trim() || null,
        estado_civil: estadoCivil || null,
        email: email.trim() || null,
        telefone: tel,
        cep: cep.trim() || null,
        logradouro: logradouro.trim() || null,
        numero: numero.trim() || null,
        complemento: complemento.trim() || null,
        bairro: bairro.trim() || null,
        cidade: cidade.trim() || null,
        uf: uf.trim() || null,
      };

      const url = editing ? `/api/pacientes/${editing.id}` : "/api/pacientes";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar paciente.");

      closeModal();
      setFeedback({
        title: editing ? "Paciente atualizado" : "Paciente cadastrado",
        message: editing
          ? `Os dados do paciente foram salvos.`
          : `O paciente foi cadastrado com sucesso.`,
      });
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar paciente.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmarMudancaStatus() {
    if (!confirmStatus) return;
    setChangingStatus(true);
    setListError(null);
    try {
      const ativo = confirmStatus.acao === "ativar";
      const res = await fetch(`/api/pacientes/${confirmStatus.row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setListError(json.error ?? "Erro ao atualizar status.");
        setConfirmStatus(null);
        return;
      }
      setFeedback({
        title: ativo ? "Paciente ativado" : "Paciente inativado",
        message: ativo
          ? `O paciente "${confirmStatus.row.nome_exibicao}" foi ativado.`
          : `O paciente "${confirmStatus.row.nome_exibicao}" foi inativado.`,
      });
      setConfirmStatus(null);
      router.refresh();
    } finally {
      setChangingStatus(false);
    }
  }

  async function onArquivoImportarPacientes(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportandoArquivo(true);
    setListError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/pacientes/import", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        importados?: number;
        ignorados?: { linha: number; motivo: string }[];
        mensagem?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Falha na importação.");
      setResultadoImport({
        importados: json.importados ?? 0,
        ignorados: json.ignorados ?? [],
        mensagem: json.mensagem ?? "",
      });
      router.refresh();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Erro ao importar pacientes.");
    } finally {
      setImportandoArquivo(false);
    }
  }

  if (loadError) {
    return (
      <div className="alert alert-danger" role="alert">
        {loadError}
      </div>
    );
  }

  const labelNome = usarNomeSocial ? "Nome social" : "Nome completo";

  return (
    <>
      {listError ? (
        <div className="alert alert-warning alert-dismissible fade show" role="alert">
          <button
            type="button"
            className="close"
            aria-label="Fechar"
            onClick={() => setListError(null)}
          >
            <span aria-hidden="true">&times;</span>
          </button>
          {listError}
        </div>
      ) : null}

      <div className="card card-outline card-primary">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center">
          <h3 className="card-title mb-2 mb-sm-0">Pacientes</h3>
          <div className="d-flex flex-wrap align-items-center" style={{ gap: "0.5rem" }}>
            <input
              ref={fileImportRef}
              type="file"
              className="d-none"
              accept=".csv,.xlsx,.xls,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(ev) => void onArquivoImportarPacientes(ev)}
            />
            <button
              type="button"
              className="btn btn-outline-success btn-sm"
              disabled={importandoArquivo}
              onClick={() => fileImportRef.current?.click()}
              title="Arquivo CSV (separado por vírgula) ou Excel. Colunas: nome_completo, data_nascimento, genero, cpf, estado_civil, cep, uf, cidade, logradouro, bairro, numero, complemento, email, telefone (nome_cliente no lugar de nome_completo)"
            >
              {importandoArquivo ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm mr-1"
                    role="status"
                    aria-hidden
                  />
                  Importando...
                </>
              ) : (
                <>
                  <i className="fas fa-file-alt mr-1" aria-hidden /> Importar pacientes
                  (CSV / Excel)
                </>
              )}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
              <i className="fas fa-user-plus mr-1" aria-hidden /> Novo paciente
            </button>
          </div>
        </div>
        <div className="card-body border-bottom py-3">
          <p className="text-muted small mb-2 mb-md-3">Consultar pacientes</p>
          <div className="form-group mb-3 mb-md-2">
            <label htmlFor={filtroNomeEmailId} className="mb-1">
              Nome ou e-mail
            </label>
            <input
              id={filtroNomeEmailId}
              type="search"
              className="form-control"
              placeholder="Parte do nome ou do e-mail..."
              value={filtroNomeEmail}
              onChange={(e) => setFiltroNomeEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="form-row">
            <div className="form-group col-md-4">
              <label htmlFor={filtroCpfId} className="mb-1">
                CPF
              </label>
              <input
                id={filtroCpfId}
                type="search"
                className="form-control"
                inputMode="numeric"
                placeholder="Somente números"
                value={filtroCpf}
                onChange={(e) => setFiltroCpf(normalizeCpfDigits(e.target.value).slice(0, 11))}
                autoComplete="off"
              />
            </div>
            <div className="form-group col-md-4">
              <label htmlFor={filtroTelefoneId} className="mb-1">
                Telefone
              </label>
              <input
                id={filtroTelefoneId}
                type="search"
                className="form-control"
                inputMode="tel"
                placeholder="Números do telefone"
                value={filtroTelefone}
                onChange={(e) =>
                  setFiltroTelefone(normalizeCpfDigits(e.target.value))
                }
                autoComplete="off"
              />
            </div>
            <div className="form-group col-md-4 mb-0">
              <label htmlFor={filtroCidadeId} className="mb-1">
                Cidade
              </label>
              <input
                id={filtroCidadeId}
                type="search"
                className="form-control"
                placeholder="Parte do nome da cidade"
                value={filtroCidade}
                onChange={(e) => setFiltroCidade(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <small className="form-text text-muted mb-0">
            Os filtros se combinam: preencha só o que precisar. CPF e telefone aceitam parte dos
            dígitos.
          </small>
        </div>
        <div className="card-body border-bottom py-2 bg-light">
          <div className="d-flex flex-wrap align-items-center justify-content-between" style={{ gap: "0.75rem" }}>
            <div className="small text-muted mb-0">
              {totalFiltrados === 0 ? (
                "Nenhum registro na consulta."
              ) : (
                <>
                  Mostrando <strong>{inicioExib}</strong>–<strong>{fimExib}</strong> de{" "}
                  <strong>{totalFiltrados}</strong>
                  {tamanhoPagina !== "all" ? (
                    <>
                      {" "}
                      (página {paginaEfetiva} de {totalPaginas})
                    </>
                  ) : null}
                </>
              )}
            </div>
            <div className="d-flex flex-wrap align-items-center" style={{ gap: "0.5rem" }}>
              <label htmlFor="pacientes-por-pagina" className="small mb-0 text-nowrap">
                Registros por página
              </label>
              <select
                id="pacientes-por-pagina"
                className="form-control form-control-sm"
                style={{ width: "auto", minWidth: "5.5rem" }}
                value={tamanhoPagina === "all" ? "all" : String(tamanhoPagina)}
                onChange={(e) => {
                  const v = e.target.value;
                  setTamanhoPagina(v === "all" ? "all" : (Number(v) as TamanhoPagina));
                  setPaginaAtual(1);
                }}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="30">30</option>
                <option value="40">40</option>
                <option value="50">50</option>
                <option value="all">Todos</option>
              </select>
              <div className="btn-group btn-group-sm" role="group" aria-label="Paginação">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={tamanhoPagina === "all" || paginaEfetiva <= 1}
                  onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={tamanhoPagina === "all" || paginaEfetiva >= totalPaginas}
                  onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>
        </div>
        <div
          className="card-body p-0 position-relative"
          style={{
            maxHeight: "min(55vh, 520px)",
            overflow: "auto",
          }}
        >
          <table className="table table-hover table-striped mb-0">
            <thead
              className="text-nowrap"
              style={{
                position: "sticky",
                top: 0,
                zIndex: 2,
                backgroundColor: "#fff",
                boxShadow: "0 1px 0 #dee2e6",
              }}
            >
              <tr>
                <th style={{ width: "70px" }}>ID</th>
                <th>Nome</th>
                <th>CPF</th>
                <th>Telefone</th>
                <th>Nascimento</th>
                <th style={{ width: "90px" }}>Status</th>
                <th style={{ width: "260px" }} className="text-right">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {totalFiltrados === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    {rows.length === 0
                      ? "Nenhum paciente cadastrado."
                      : "Nenhum paciente encontrado para esta consulta."}
                  </td>
                </tr>
              ) : (
                visiveis.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.nome_exibicao}</td>
                    <td>{formatCpfExibicao(row.cpf)}</td>
                    <td>{row.telefone || "-"}</td>
                    <td>{formatDataBr(row.data_nascimento)}</td>
                    <td>
                      {row.ativo ? (
                        <span className="badge badge-success">Ativo</span>
                      ) : (
                        <span className="badge badge-secondary">Inativo</span>
                      )}
                    </td>
                    <td className="text-right text-nowrap">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary mr-1"
                        onClick={() => openEdit(row)}
                      >
                        <i className="fas fa-edit" aria-hidden /> Editar
                      </button>
                      {row.ativo ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => setConfirmStatus({ row, acao: "inativar" })}
                        >
                          <i className="fas fa-ban" aria-hidden /> Inativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          onClick={() => setConfirmStatus({ row, acao: "ativar" })}
                        >
                          <i className="fas fa-check" aria-hidden /> Ativar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <ModalBackdrop onBackdropClick={closeModal}>
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content">
              <div className="d-flex flex-column h-100">
                <div className="modal-header">
                  <h5 className="modal-title" id={modalTitleId}>
                    {editing ? "Editar paciente" : "Novo paciente"}
                  </h5>
                  <button
                    type="button"
                    className="close"
                    aria-label="Fechar"
                    onClick={closeModal}
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
                <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
                  {formError ? (
                    <div className="alert alert-danger py-2 small" role="alert">
                      {formError}
                    </div>
                  ) : null}
                  {editing && avisoEdicaoCadastro ? (
                    <div className="alert alert-warning py-2 small" role="alert">
                      <i className="fas fa-exclamation-triangle mr-1" aria-hidden />
                      {avisoEdicaoCadastro}
                    </div>
                  ) : null}

                  <div className="form-group">
                    <label htmlFor="pac-cpf">CPF</label>
                    <input
                      ref={pacienteCpfInputRef}
                      id="pac-cpf"
                      name="pac_cpf_opcional"
                      type="text"
                      className="form-control"
                      inputMode="numeric"
                      autoComplete="off"
                      spellCheck={false}
                      data-paciente-cpf-opcional=""
                      placeholder="Opcional — pode ficar vazio"
                      value={cpf}
                      onChange={(e) => {
                        onCpfChange(e.target.value);
                        clearCpfCampoValidacaoNativa();
                      }}
                    />
                    <small className="form-text text-muted">
                      O preenchimento do CPF é opcional.
                    </small>
                  </div>

                  <div className="form-group">
                    <div className="d-flex flex-wrap align-items-center justify-content-between">
                      <label htmlFor="pac-nome" className="mb-0">
                        {labelNome}
                      </label>
                      <div className="form-check mb-0">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="pac-nome-social-check"
                          checked={usarNomeSocial}
                          onChange={(e) => setUsarNomeSocial(e.target.checked)}
                        />
                        <label className="form-check-label" htmlFor="pac-nome-social-check">
                          Nome social
                        </label>
                      </div>
                    </div>
                    <input
                      id="pac-nome"
                      className="form-control"
                      value={nomePrincipal}
                      onChange={(e) => setNomePrincipal(e.target.value)}
                    />
                    <small className="form-text text-muted">
                      Marque &quot;Nome social&quot; para cadastrar o paciente pelo nome social em
                      vez do nome completo.
                    </small>
                  </div>

                  <div className="form-group">
                    <label htmlFor="pac-tel">Telefone</label>
                    <input
                      id="pac-tel"
                      className="form-control"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group col-md-6">
                      <label htmlFor="pac-genero">Gênero</label>
                      <select
                        id="pac-genero"
                        className="form-control"
                        value={genero}
                        onChange={(e) => setGenero(e.target.value)}
                      >
                        <option value="">—</option>
                        {PACIENTE_GENEROS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group col-md-6">
                      <label htmlFor="pac-nasc">Data de nascimento</label>
                      <input
                        id="pac-nasc"
                        type="date"
                        className="form-control"
                        value={dataNascimento}
                        onChange={(e) => setDataNascimento(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="pac-ec">Estado civil</label>
                    <select
                      id="pac-ec"
                      className="form-control"
                      value={estadoCivil}
                      onChange={(e) => setEstadoCivil(e.target.value)}
                    >
                      <option value="">—</option>
                      {PACIENTE_ESTADOS_CIVIS.map((ec) => (
                        <option key={ec} value={ec}>
                          {ec}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="pac-email">E-mail</label>
                    <input
                      id="pac-email"
                      type="email"
                      className="form-control"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <hr className="my-2" />
                  <p className="text-muted small mb-2">Endereço</p>

                  <div className="form-row">
                    <div className="form-group col-md-4">
                      <label htmlFor="pac-cep">CEP</label>
                      <div className="input-group">
                        <input
                          id="pac-cep"
                          className="form-control"
                          inputMode="numeric"
                          autoComplete="postal-code"
                          placeholder="00000-000"
                          value={formatCepInput(cep)}
                          onChange={(e) => onCepChange(e.target.value)}
                          onBlur={() => {
                            if (normalizeCepDigits(cep).length === 8) {
                              void buscarCepPeloEndereco();
                            }
                          }}
                          disabled={cepBuscando}
                        />
                        <div className="input-group-append">
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={() => void buscarCepPeloEndereco({ avisarSeIncompleto: true })}
                            disabled={cepBuscando || normalizeCepDigits(cep).length !== 8}
                            title="Buscar endereço pelo CEP"
                          >
                            {cepBuscando ? (
                              <span className="spinner-border spinner-border-sm" role="status" />
                            ) : (
                              <i className="fas fa-search" aria-hidden />
                            )}
                          </button>
                        </div>
                      </div>
                      {cepMensagem ? (
                        <small
                          className={`form-text ${
                            cepMensagem.startsWith("Endereço") ? "text-success" : "text-warning"
                          }`}
                        >
                          {cepMensagem}
                        </small>
                      ) : (
                        <small className="form-text text-muted">
                          Ao sair do campo ou ao clicar na lupa, o endereço é preenchido
                          automaticamente (ViaCEP).
                        </small>
                      )}
                    </div>
                    <div className="form-group col-md-8">
                      <label htmlFor="pac-log">Logradouro</label>
                      <input
                        id="pac-log"
                        className="form-control"
                        value={logradouro}
                        onChange={(e) => setLogradouro(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group col-md-3">
                      <label htmlFor="pac-num">Número</label>
                      <input
                        id="pac-num"
                        className="form-control"
                        value={numero}
                        onChange={(e) => setNumero(e.target.value)}
                        placeholder="Ex.: 123 ou S/N"
                      />
                    </div>
                    <div className="form-group col-md-9">
                      <label htmlFor="pac-comp">Complemento</label>
                      <input
                        id="pac-comp"
                        className="form-control"
                        value={complemento}
                        onChange={(e) => setComplemento(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group col-md-4">
                      <label htmlFor="pac-bairro">Bairro</label>
                      <input
                        id="pac-bairro"
                        className="form-control"
                        value={bairro}
                        onChange={(e) => setBairro(e.target.value)}
                      />
                    </div>
                    <div className="form-group col-md-6">
                      <label htmlFor="pac-cidade">Cidade</label>
                      <input
                        id="pac-cidade"
                        className="form-control"
                        value={cidade}
                        onChange={(e) => setCidade(e.target.value)}
                      />
                    </div>
                    <div className="form-group col-md-2">
                      <label htmlFor="pac-uf">UF</label>
                      <input
                        id="pac-uf"
                        className="form-control"
                        value={uf}
                        onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
                        maxLength={2}
                        placeholder="SP"
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => {
                      clearCpfCampoValidacaoNativa();
                      void submit();
                    }}
                  >
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {confirmStatus ? (
        <ModalBackdrop
          onBackdropClick={() => {
            if (!changingStatus) setConfirmStatus(null);
          }}
        >
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <div className="modal-header bg-light">
                <h5 className="modal-title" id={confirmTitleId}>
                  {confirmStatus.acao === "ativar"
                    ? "Confirmar ativação"
                    : "Confirmar inativação"}
                </h5>
                <button
                  type="button"
                  className="close"
                  disabled={changingStatus}
                  onClick={() => setConfirmStatus(null)}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  {confirmStatus.acao === "ativar"
                    ? `Ativar o paciente "${confirmStatus.row.nome_exibicao}"?`
                    : `Inativar o paciente "${confirmStatus.row.nome_exibicao}"?`}
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={changingStatus}
                  onClick={() => setConfirmStatus(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={
                    confirmStatus.acao === "ativar"
                      ? "btn btn-success"
                      : "btn btn-danger"
                  }
                  disabled={changingStatus}
                  onClick={() => void confirmarMudancaStatus()}
                >
                  {changingStatus ? "Processando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {feedback ? (
        <ModalBackdrop onBackdropClick={() => setFeedback(null)}>
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title text-success">
                  <i className="fas fa-check-circle mr-2" aria-hidden />
                  {feedback.title}
                </h5>
                <button
                  type="button"
                  className="close"
                  aria-label="Fechar"
                  onClick={() => setFeedback(null)}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body pt-2">
                <p className="mb-0">{feedback.message}</p>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button type="button" className="btn btn-primary" onClick={() => setFeedback(null)}>
                  OK
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {resultadoImport ? (
        <ModalBackdrop onBackdropClick={() => setResultadoImport(null)}>
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Importação de pacientes</h5>
                <button
                  type="button"
                  className="close"
                  aria-label="Fechar"
                  onClick={() => setResultadoImport(null)}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="mb-2">{resultadoImport.mensagem}</p>
                <p className="mb-2">
                  <strong>Importados:</strong> {resultadoImport.importados} &nbsp;|&nbsp;
                  <strong>Linhas ignoradas:</strong> {resultadoImport.ignorados.length}
                </p>
                {resultadoImport.ignorados.length > 0 ? (
                  <div
                    className="border rounded"
                    style={{ maxHeight: "240px", overflowY: "auto" }}
                  >
                    <table className="table table-sm table-striped mb-0">
                      <thead>
                        <tr>
                          <th>Linha</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultadoImport.ignorados.map((ig, i) => (
                          <tr key={`${ig.linha}-${i}`}>
                            <td>{ig.linha}</td>
                            <td>{ig.motivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <p className="text-muted small mb-0 mt-2">
                  Os dados foram gravados na tabela de pacientes da empresa atual. Use arquivo CSV
                  (valores separados por vírgula) exportado pelo Excel ou planilha .xlsx/.xls. CPF e
                  telefone podem ficar vazios; não são permitidos CPF ou nome completo duplicados.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setResultadoImport(null)}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </>
  );
}
