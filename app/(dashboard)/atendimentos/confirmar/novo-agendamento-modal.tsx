"use client";

import { type ReactNode, useCallback, useEffect, useId, useMemo, useState } from "react";

type PacienteOpt = {
  id: number;
  nome_completo: string | null;
  nome_social: string | null;
  telefone: string | null;
};

type ProfissionalOpt = {
  id: number;
  nome_completo: string | null;
  usuario: string;
  ativo: boolean;
  exibir_na_agenda: boolean;
};

type SalaOpt = {
  id: number;
  id_empresa: number;
  nome_sala: string;
  ativo: boolean;
};

function nomePaciente(p: PacienteOpt): string {
  return p.nome_completo?.trim() || p.nome_social?.trim() || `Paciente #${p.id}`;
}

function nomeProfissional(p: ProfissionalOpt): string {
  return p.nome_completo?.trim() || p.usuario.trim() || `Profissional #${p.id}`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function defaultInicioLocal(dataPadrao?: string): string {
  const hojeIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Dia diferente de hoje: começa às 09:00 do dia escolhido.
  if (dataPadrao && /^\d{4}-\d{2}-\d{2}$/.test(dataPadrao) && dataPadrao !== hojeIso) {
    return `${dataPadrao}T09:00`;
  }

  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  d.setHours(d.getHours() + 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fimAPartirDeInicio(inicioLocal: string): string {
  const d = new Date(inicioLocal);
  if (Number.isNaN(d.getTime())) return inicioLocal;
  d.setMinutes(d.getMinutes() + 30);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toIsoBrasilia(localDatetime: string): string {
  return `${localDatetime}:00.000-03:00`;
}

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
        onKeyDown={(e) => {
          if (e.key === "Escape") onBackdropClick();
        }}
      />
    </>
  );
}

export function NovoAgendamentoModal({
  onFechar,
  onCriado,
  dataPadrao,
}: {
  onFechar: () => void;
  onCriado: () => void;
  dataPadrao?: string;
}) {
  const tituloId = useId();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [pacientes, setPacientes] = useState<PacienteOpt[]>([]);
  const [profissionais, setProfissionais] = useState<ProfissionalOpt[]>([]);
  const [salas, setSalas] = useState<SalaOpt[]>([]);

  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [idPaciente, setIdPaciente] = useState<number | "">("");
  const [idProfissional, setIdProfissional] = useState<number | "">("");
  const [idSala, setIdSala] = useState<number | "">("");
  const [inicioLocal, setInicioLocal] = useState(() => defaultInicioLocal(dataPadrao));
  const [fimLocal, setFimLocal] = useState(() => fimAPartirDeInicio(defaultInicioLocal(dataPadrao)));
  const [observacoes, setObservacoes] = useState("");

  const profissionaisAgenda = useMemo(
    () => profissionais.filter((p) => p.ativo && p.exibir_na_agenda),
    [profissionais],
  );
  const salasAtivas = useMemo(() => salas.filter((s) => s.ativo), [salas]);

  const carregarCatalogos = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [pr, us, sa] = await Promise.all([
        fetch("/api/pacientes", { credentials: "include" }),
        fetch("/api/usuarios", { credentials: "include" }),
        fetch("/api/salas", { credentials: "include" }),
      ]);
      const [jp, ju, js] = await Promise.all([pr.json(), us.json(), sa.json()]);
      if (!pr.ok) throw new Error(jp.error ?? "Erro ao carregar pacientes.");
      if (!us.ok) throw new Error(ju.error ?? "Erro ao carregar profissionais.");
      if (!sa.ok) throw new Error(js.error ?? "Erro ao carregar salas.");
      setPacientes((jp.data ?? []) as PacienteOpt[]);
      setProfissionais((ju.data ?? []) as ProfissionalOpt[]);
      setSalas((js.data ?? []) as SalaOpt[]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarCatalogos();
  }, [carregarCatalogos]);

  useEffect(() => {
    if (buscaPaciente.trim().length < 2) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/pacientes?busca=${encodeURIComponent(buscaPaciente.trim())}`,
          { credentials: "include" },
        );
        const json = await res.json();
        if (res.ok && Array.isArray(json.data)) {
          setPacientes(json.data as PacienteOpt[]);
        }
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [buscaPaciente]);

  useEffect(() => {
    setFimLocal(fimAPartirDeInicio(inicioLocal));
  }, [inicioLocal]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (!idPaciente || !idProfissional || !idSala) {
      setErro("Selecione paciente, profissional e sala.");
      return;
    }

    setSalvando(true);
    try {
      const res = await fetch("/api/agendamentos", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id_paciente: idPaciente,
          id_usuario: idProfissional,
          id_sala: idSala,
          data_hora_inicio: toIsoBrasilia(inicioLocal),
          data_hora_fim: toIsoBrasilia(fimLocal),
          status: "pendente",
          observacoes: observacoes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao agendar.");
      setSucesso(`Agendamento #${json.data?.id ?? ""} criado com sucesso.`);
      setObservacoes("");
      setIdPaciente("");
      setBuscaPaciente("");
      onCriado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao agendar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBackdrop onBackdropClick={onFechar}>
      <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
        <div className="modal-content">
          <form onSubmit={(e) => void salvar(e)}>
            <div className="modal-header">
              <h5 className="modal-title" id={tituloId}>
                Novo agendamento
              </h5>
              <button type="button" className="close" onClick={onFechar} aria-label="Fechar">
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="modal-body">
              {erro ? (
                <div className="alert alert-danger" role="alert">
                  {erro}
                </div>
              ) : null}
              {sucesso ? (
                <div className="alert alert-success" role="alert">
                  {sucesso}
                </div>
              ) : null}

              {carregando ? (
                <p className="text-muted mb-0">Carregando…</p>
              ) : (
                <>
                  <div className="form-group">
                    <label htmlFor="novo-busca-paciente">Buscar paciente</label>
                    <input
                      id="novo-busca-paciente"
                      type="search"
                      className="form-control"
                      placeholder="Digite nome ou telefone (mín. 2 caracteres)"
                      value={buscaPaciente}
                      onChange={(e) => setBuscaPaciente(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="novo-paciente">Paciente *</label>
                    <select
                      id="novo-paciente"
                      className="form-control"
                      required
                      value={idPaciente}
                      onChange={(e) => setIdPaciente(e.target.value ? Number(e.target.value) : "")}
                    >
                      <option value="">Selecione…</option>
                      {pacientes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {nomePaciente(p)}
                          {p.telefone ? ` — ${p.telefone}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="novo-profissional">Profissional *</label>
                        <select
                          id="novo-profissional"
                          className="form-control"
                          required
                          value={idProfissional}
                          onChange={(e) =>
                            setIdProfissional(e.target.value ? Number(e.target.value) : "")
                          }
                        >
                          <option value="">Selecione…</option>
                          {profissionaisAgenda.map((p) => (
                            <option key={p.id} value={p.id}>
                              {nomeProfissional(p)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="novo-sala">Sala *</label>
                        <select
                          id="novo-sala"
                          className="form-control"
                          required
                          value={idSala}
                          onChange={(e) => setIdSala(e.target.value ? Number(e.target.value) : "")}
                        >
                          <option value="">Selecione…</option>
                          {salasAtivas.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nome_sala}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="novo-inicio">Início *</label>
                        <input
                          id="novo-inicio"
                          type="datetime-local"
                          className="form-control"
                          required
                          value={inicioLocal}
                          onChange={(e) => setInicioLocal(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="novo-fim">Término *</label>
                        <input
                          id="novo-fim"
                          type="datetime-local"
                          className="form-control"
                          required
                          value={fimLocal}
                          onChange={(e) => setFimLocal(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-group mb-0">
                    <label htmlFor="novo-obs">Observações</label>
                    <textarea
                      id="novo-obs"
                      className="form-control"
                      rows={2}
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onFechar}>
                Fechar
              </button>
              <button type="submit" className="btn btn-primary" disabled={salvando || carregando}>
                {salvando ? "Salvando…" : "Agendar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalBackdrop>
  );
}
