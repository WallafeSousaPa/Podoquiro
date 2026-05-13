"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

type AgMin = {
  id: number;
  paciente_nome: string;
  nome_sala: string;
  data_hora_inicio: string;
  data_hora_fim: string;
  status: string;
};

type ProcLinha = { id_procedimento: number; nome: string };

type FotoExistente = { path: string; url: string };

type Props = {
  ag: AgMin;
  onClose: () => void;
  onSalvo: () => void;
};

function fmtDataHora(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

const MAX_FOTOS = 4;

function MiniaturaFotoProntuario({
  src,
  onRemove,
}: {
  src: string;
  onRemove: () => void;
}) {
  const [imagemCarregada, setImagemCarregada] = useState(false);

  useEffect(() => {
    setImagemCarregada(false);
  }, [src]);

  return (
    <div
      className="position-relative border rounded overflow-hidden mr-2 mb-2 prontuario-foto-thumb"
      style={{ width: 96, height: 96 }}
      aria-busy={!imagemCarregada}
    >
      {!imagemCarregada ? (
        <div className="prontuario-foto-loading d-flex align-items-center justify-content-center bg-light w-100 h-100 position-absolute">
          <span
            className="spinner-border spinner-border-sm text-secondary"
            role="status"
            aria-label="Carregando imagem"
          />
        </div>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="w-100 h-100"
        style={{
          objectFit: "cover",
          opacity: imagemCarregada ? 1 : 0,
        }}
        onLoad={() => setImagemCarregada(true)}
        onError={() => setImagemCarregada(true)}
      />
      <button
        type="button"
        className="btn btn-sm btn-danger position-absolute"
        style={{ top: 2, right: 2, padding: "0 4px", lineHeight: 1 }}
        title="Remover"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

function DropdownChecklistProcedimentos({
  procedimentos,
  selecionados,
  onToggle,
  disabled,
}: {
  procedimentos: ProcLinha[];
  selecionados: Set<number>;
  onToggle: (id: number) => void;
  disabled: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [aberto]);

  const rotulo =
    selecionados.size === 0
      ? "Selecione os procedimentos realizados…"
      : `${selecionados.size} procedimento(s) selecionado(s)`;

  return (
    <div className="prontuario-proc-dropdown-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn btn-outline-secondary w-100 d-flex justify-content-between align-items-center text-left"
        onClick={() => setAberto((v) => !v)}
        disabled={disabled || procedimentos.length === 0}
        aria-expanded={aberto}
        aria-haspopup="listbox"
      >
        <span className="text-truncate">{rotulo}</span>
        <span className="ml-2 flex-shrink-0" aria-hidden>
          ▾
        </span>
      </button>
      {aberto && procedimentos.length > 0 ? (
        <div
          className="prontuario-proc-dropdown-menu border rounded bg-white shadow-sm py-2"
          role="listbox"
        >
          {procedimentos.map((p) => (
            <label
              key={p.id_procedimento}
              className="d-flex align-items-center px-3 py-1 mb-0 small prontuario-proc-item"
            >
              <input
                type="checkbox"
                className="mr-2 flex-shrink-0"
                checked={selecionados.has(p.id_procedimento)}
                onChange={() => onToggle(p.id_procedimento)}
              />
              <span className="text-truncate">{p.nome}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ModalProntuarioPodologo({ ag, onClose, onSalvo }: Props) {
  const titleId = useId();
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [procedimentos, setProcedimentos] = useState<ProcLinha[]>([]);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [evolucao, setEvolucao] = useState("");

  const [fotosExistentes, setFotosExistentes] = useState<FotoExistente[]>([]);
  const [novosArquivos, setNovosArquivos] = useState<File[]>([]);

  const previewsNovos = useMemo(
    () => novosArquivos.map((f) => URL.createObjectURL(f)),
    [novosArquivos],
  );

  useEffect(() => {
    return () => {
      previewsNovos.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [previewsNovos]);

  const totalFotos = fotosExistentes.length + novosArquivos.length;

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/prontuario/atendimento/${ag.id}`);
      const j = (await res.json()) as {
        error?: string;
        procedimentos?: ProcLinha[];
        prontuario?: {
          evolucao: string;
          procedimentos_realizados: number[];
          fotos: FotoExistente[];
        } | null;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setProcedimentos(j.procedimentos ?? []);
      const pr = j.prontuario;
      if (pr) {
        setEvolucao(pr.evolucao ?? "");
        setSelecionados(new Set(pr.procedimentos_realizados ?? []));
        setFotosExistentes(pr.fotos ?? []);
      } else {
        setEvolucao("");
        setSelecionados(new Set());
        setFotosExistentes([]);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [ag.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function toggleProc(id: number) {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function onPickFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    const maxNovosTotal = MAX_FOTOS - fotosExistentes.length;
    if (maxNovosTotal <= 0) return;
    const slots = maxNovosTotal - novosArquivos.length;
    if (slots <= 0) return;
    const toAdd = Array.from(list).slice(0, slots);
    setNovosArquivos((prev) => [...prev, ...toAdd].slice(0, maxNovosTotal));
    e.target.value = "";
  }

  function removerNovo(idx: number) {
    setNovosArquivos((prev) => prev.filter((_, i) => i !== idx));
  }

  function removerExistente(path: string) {
    setFotosExistentes((prev) => prev.filter((f) => f.path !== path));
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      if (selecionados.size === 0) {
        setErro("Selecione ao menos um procedimento realizado.");
        return;
      }
      const evolucaoLimpa = evolucao
        .trim()
        .replace(/\0/g, "")
        .replace(/\uFEFF/g, "");
      if (evolucaoLimpa.length < 3) {
        setErro("Informe a evolução (mínimo 3 caracteres).");
        return;
      }

      const fd = new FormData();
      fd.append("id_agendamento", String(ag.id));
      fd.append("evolucao", evolucaoLimpa);
      fd.append(
        "procedimentos_ids",
        JSON.stringify([...selecionados]),
      );
      fd.append(
        "caminhos_manter",
        JSON.stringify(fotosExistentes.map((f) => f.path)),
      );
      novosArquivos.forEach((file, i) => {
        fd.append(`foto_${i}`, file);
      });

      const res = await fetch("/api/prontuario", {
        method: "POST",
        body: fd,
      });
      const raw = await res.text();
      let j: { error?: string; ok?: boolean } = {};
      try {
        j = raw ? (JSON.parse(raw) as { error?: string; ok?: boolean }) : {};
      } catch {
        if (!res.ok) {
          setErro(
            res.status >= 500
              ? "O servidor retornou um erro ao salvar. Tente de novo em instantes ou sem anexar fotos."
              : "Não foi possível ler a resposta do servidor. Verifique sua conexão e tente novamente.",
          );
          return;
        }
        setErro("Resposta do servidor em formato inesperado. Atualize a página e tente de novo.");
        return;
      }
      if (!res.ok) throw new Error(j.error ?? "Erro ao salvar.");
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const podeMaisFotos = totalFotos < MAX_FOTOS;

  const rotuloStatus = useMemo(() => {
    if (ag.status === "em_andamento") return "Em andamento";
    return ag.status;
  }, [ag.status]);

  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block", zIndex: 1072 }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-dialog modal-lg modal-prontuario-dialog" role="document">
          <div className="modal-content">
            <form onSubmit={(e) => void enviar(e)}>
              <div className="modal-header">
                <h5 className="modal-title" id={titleId}>
                  Prontuário do atendimento
                </h5>
                <button
                  type="button"
                  className="close"
                  disabled={salvando}
                  onClick={onClose}
                  aria-label="Fechar"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                {loading ? (
                  <p className="text-muted mb-0">Carregando…</p>
                ) : (
                  <>
                    <p className="mb-2">
                      <strong>{ag.paciente_nome}</strong>
                    </p>
                    <ul className="small text-muted pl-3 mb-3">
                      <li>Início: {fmtDataHora(ag.data_hora_inicio)}</li>
                      <li>Término: {fmtDataHora(ag.data_hora_fim)}</li>
                      <li>Sala: {ag.nome_sala}</li>
                      <li>Status: {rotuloStatus}</li>
                    </ul>

                    {erro ? (
                      <div className="alert alert-danger py-2 small" role="alert">
                        {erro}
                      </div>
                    ) : null}

                    <div className="form-group">
                      <label className="font-weight-bold">Procedimentos realizados</label>
                      <p className="small text-muted mb-2">
                        Abra a lista e marque o que foi efetivamente realizado neste atendimento.
                      </p>
                      {procedimentos.length === 0 ? (
                        <span className="text-muted small d-block">
                          Nenhum procedimento no agendamento.
                        </span>
                      ) : (
                        <DropdownChecklistProcedimentos
                          procedimentos={procedimentos}
                          selecionados={selecionados}
                          onToggle={toggleProc}
                          disabled={salvando}
                        />
                      )}
                    </div>

                    <div className="form-group">
                      <label htmlFor="evo-prontuario" className="font-weight-bold">
                        Evolução
                      </label>
                      <textarea
                        id="evo-prontuario"
                        className="form-control"
                        rows={5}
                        value={evolucao}
                        onChange={(e) => setEvolucao(e.target.value)}
                        placeholder="Descreva o que foi feito no atendimento."
                        required
                        minLength={3}
                      />
                    </div>

                    <div className="form-group mb-0">
                      <label className="font-weight-bold d-block">Fotos (até {MAX_FOTOS})</label>
                      <p className="small text-muted mb-2">
                        Anexe até {MAX_FOTOS} imagens no total (incluindo as já salvas).
                      </p>
                      {podeMaisFotos ? (
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="form-control-file small"
                          onChange={onPickFotos}
                        />
                      ) : (
                        <p className="small text-muted mb-0">Limite de {MAX_FOTOS} fotos atingido.</p>
                      )}

                      <div className="d-flex flex-wrap mt-2">
                        {fotosExistentes.map((f) => (
                          <MiniaturaFotoProntuario
                            key={f.path}
                            src={f.url}
                            onRemove={() => removerExistente(f.path)}
                          />
                        ))}
                        {novosArquivos.map((file, idx) => (
                          <MiniaturaFotoProntuario
                            key={previewsNovos[idx] ?? `${file.name}-${idx}`}
                            src={previewsNovos[idx]!}
                            onRemove={() => removerNovo(idx)}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={salvando || loading}
                  onClick={onClose}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={salvando || loading}
                >
                  {salvando ? "Salvando…" : "Salvar prontuário"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: 1067 }}
        role="presentation"
        onClick={() => !salvando && onClose()}
      />
    </>
  );
}
