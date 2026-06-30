"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

function defaultInicioLocal(): string {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  d.setHours(d.getHours() + 1);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const h = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}

function fimAPartirDeInicio(inicioLocal: string): string {
  const d = new Date(inicioLocal);
  if (Number.isNaN(d.getTime())) return inicioLocal;
  d.setMinutes(d.getMinutes() + 30);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const h = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}

function toIsoBrasilia(localDatetime: string): string {
  return `${localDatetime}:00.000-03:00`;
}

export function AgendarAtendimentoClient() {
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
  const [inicioLocal, setInicioLocal] = useState(defaultInicioLocal);
  const [fimLocal, setFimLocal] = useState(() => fimAPartirDeInicio(defaultInicioLocal()));
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
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao agendar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="card">
        <div className="card-body text-muted">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="card card-primary card-outline">
      <div className="card-header">
        <h3 className="card-title">Novo agendamento</h3>
      </div>
      <form onSubmit={(e) => void salvar(e)}>
        <div className="card-body">
          {erro ? (
            <div className="alert alert-danger" role="alert">
              {erro}
            </div>
          ) : null}
          {sucesso ? (
            <div className="alert alert-success" role="alert">
              {sucesso}{" "}
              <a href="/atendimentos/confirmar" className="alert-link">
                Ir para confirmação
              </a>
            </div>
          ) : null}

          <div className="form-group">
            <label htmlFor="agendar-busca-paciente">Buscar paciente</label>
            <input
              id="agendar-busca-paciente"
              type="search"
              className="form-control"
              placeholder="Digite nome ou telefone (mín. 2 caracteres)"
              value={buscaPaciente}
              onChange={(e) => setBuscaPaciente(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="agendar-paciente">Paciente *</label>
            <select
              id="agendar-paciente"
              className="form-control"
              required
              value={idPaciente}
              onChange={(e) =>
                setIdPaciente(e.target.value ? Number(e.target.value) : "")
              }
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
                <label htmlFor="agendar-profissional">Profissional *</label>
                <select
                  id="agendar-profissional"
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
                <label htmlFor="agendar-sala">Sala *</label>
                <select
                  id="agendar-sala"
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
                <label htmlFor="agendar-inicio">Início *</label>
                <input
                  id="agendar-inicio"
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
                <label htmlFor="agendar-fim">Término *</label>
                <input
                  id="agendar-fim"
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
            <label htmlFor="agendar-obs">Observações</label>
            <textarea
              id="agendar-obs"
              className="form-control"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
        </div>
        <div className="card-footer">
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? "Salvando…" : "Agendar"}
          </button>
        </div>
      </form>
    </div>
  );
}
