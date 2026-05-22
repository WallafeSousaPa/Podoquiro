"use client";

import { MSG_ERRO_PAYLOAD_GRANDE_FOTOS_ATENDIMENTO } from "@/lib/aplicacao/mensagem-erro-anamnese";
import {
  comprimirImagemParaAnamnese,
  MAX_TOTAL_ANEXOS_ANAMNESE_BYTES,
  somaTamanhosArquivos,
} from "@/lib/client/comprimir-imagem-anamnese";
import type { HistoricoAtendimentoResumo } from "@/lib/prontuario/historico-atendimentos";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ModalProntuarioHistorico } from "./modal-prontuario-historico";

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

function contagemProcedimento(selecionados: number[], id: number): number {
  return selecionados.filter((x) => x === id).length;
}

function DropdownChecklistProcedimentos({
  procedimentos,
  selecionados,
  onAdicionar,
  onRemoverUma,
  onRemoverIndice,
  disabled,
}: {
  procedimentos: ProcLinha[];
  selecionados: number[];
  onAdicionar: (id: number) => void;
  onRemoverUma: (id: number) => void;
  onRemoverIndice: (indice: number) => void;
  disabled: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const nomePorId = useMemo(
    () => new Map(procedimentos.map((p) => [p.id_procedimento, p.nome])),
    [procedimentos],
  );

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
    selecionados.length === 0
      ? "Selecione os procedimentos realizados…"
      : `${selecionados.length} procedimento(s) selecionado(s)`;

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
          {procedimentos.map((p) => {
            const qtd = contagemProcedimento(selecionados, p.id_procedimento);
            const marcado = qtd > 0;
            return (
              <div
                key={p.id_procedimento}
                className="d-flex align-items-center px-3 py-1 small prontuario-proc-item"
              >
                <label className="d-flex align-items-center flex-grow-1 mb-0 min-width-0">
                  <input
                    type="checkbox"
                    className="mr-2 flex-shrink-0"
                    checked={marcado}
                    onChange={() => onAdicionar(p.id_procedimento)}
                  />
                  <span className="text-truncate">{p.nome}</span>
                  {qtd > 1 ? (
                    <span className="badge badge-light ml-2 flex-shrink-0">
                      ×{qtd}
                    </span>
                  ) : null}
                </label>
                {qtd > 0 ? (
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-muted py-0 px-1 flex-shrink-0"
                    title="Remover uma ocorrência"
                    disabled={disabled}
                    onClick={() => onRemoverUma(p.id_procedimento)}
                    aria-label={`Remover uma ocorrência de ${p.nome}`}
                  >
                    −
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {selecionados.length > 0 ? (
        <div className="d-flex flex-wrap mt-2 prontuario-proc-chips">
          {selecionados.map((id, idx) => (
            <span
              key={`${id}-${idx}`}
              className="badge badge-secondary d-inline-flex align-items-center mr-1 mb-1 prontuario-proc-chip"
            >
              <span className="text-truncate" style={{ maxWidth: 160 }}>
                {nomePorId.get(id) ?? `Procedimento #${id}`}
              </span>
              <button
                type="button"
                className="btn btn-link btn-sm text-white p-0 ml-1"
                style={{ lineHeight: 1, minWidth: 16 }}
                title="Remover esta ocorrência"
                disabled={disabled}
                onClick={() => onRemoverIndice(idx)}
                aria-label={`Remover ${nomePorId.get(id) ?? "procedimento"}`}
              >
                ×
              </button>
            </span>
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
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [evolucao, setEvolucao] = useState("");
  const [agendarRetorno, setAgendarRetorno] = useState(false);

  const [fotosExistentes, setFotosExistentes] = useState<FotoExistente[]>([]);
  const [novosArquivos, setNovosArquivos] = useState<File[]>([]);
  const [historico, setHistorico] = useState<HistoricoAtendimentoResumo[]>([]);
  const [modalHistoricoAberto, setModalHistoricoAberto] = useState(false);

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
        historico?: HistoricoAtendimentoResumo[];
        agendamento?: { agendar_retorno?: boolean };
        prontuario?: {
          evolucao: string;
          procedimentos_realizados: number[];
          fotos: FotoExistente[];
        } | null;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setProcedimentos(j.procedimentos ?? []);
      setHistorico(j.historico ?? []);
      const pr = j.prontuario;
      setAgendarRetorno(Boolean(j.agendamento?.agendar_retorno));
      setNovosArquivos([]);
      if (pr) {
        setEvolucao(pr.evolucao ?? "");
        setSelecionados(pr.procedimentos_realizados ?? []);
        setFotosExistentes(pr.fotos ?? []);
      } else {
        setEvolucao("");
        setSelecionados([]);
        setFotosExistentes([]);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [ag.id]);

  useEffect(() => {
    const t = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(t);
  }, [carregar]);

  function adicionarProc(id: number) {
    setSelecionados((prev) => [...prev, id]);
  }

  function removerUmaProc(id: number) {
    setSelecionados((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }

  function removerProcIndice(indice: number) {
    setSelecionados((prev) => prev.filter((_, i) => i !== indice));
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
      if (selecionados.length === 0) {
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

      const fotosComprimidas = await Promise.all(
        novosArquivos.map((file) => comprimirImagemParaAnamnese(file)),
      );
      const totalAnexos = somaTamanhosArquivos(fotosComprimidas);
      if (totalAnexos > MAX_TOTAL_ANEXOS_ANAMNESE_BYTES) {
        setErro(
          `${MSG_ERRO_PAYLOAD_GRANDE_FOTOS_ATENDIMENTO} Tamanho total das fotos após compressão: ~${(totalAnexos / (1024 * 1024)).toFixed(1)} MB (máximo recomendado ~3,5 MB).`,
        );
        return;
      }

      const fd = new FormData();
      fd.append("id_agendamento", String(ag.id));
      fd.append("evolucao", evolucaoLimpa);
      fd.append(
        "procedimentos_ids",
        JSON.stringify(selecionados),
      );
      fd.append(
        "caminhos_manter",
        JSON.stringify(fotosExistentes.map((f) => f.path)),
      );
      fd.append("agendar_retorno", agendarRetorno ? "1" : "0");
      fotosComprimidas.forEach((file, i) => {
        fd.append(`foto_${i}`, file);
      });

      const res = await fetch("/api/prontuario", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const raw = await res.text();
      let j: { error?: string; ok?: boolean } = {};
      try {
        j = raw ? (JSON.parse(raw) as { error?: string; ok?: boolean }) : {};
      } catch {
        const payloadGrande =
          res.status === 413 ||
          /FUNCTION_PAYLOAD_TOO_LARGE/i.test(raw) ||
          /Request Entity Too Large/i.test(raw);
        if (payloadGrande) {
          setErro(MSG_ERRO_PAYLOAD_GRANDE_FOTOS_ATENDIMENTO);
          return;
        }
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
      await carregar();
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const podeMaisFotos = totalFotos < MAX_FOTOS;

  const somenteConsultaRealizado = ag.status === "realizado";

  const rotuloStatus = useMemo(() => {
    if (ag.status === "em_andamento") return "Em andamento";
    if (ag.status === "realizado") return "Realizado";
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

                    <div className="mb-3">
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-block"
                        disabled={salvando || loading}
                        onClick={() => setModalHistoricoAberto(true)}
                      >
                        Histórico de atendimentos
                        {historico.length > 0 ? (
                          <span className="badge badge-primary ml-2">
                            {historico.length}
                          </span>
                        ) : null}
                      </button>
                      <p className="small text-muted mb-0 mt-1">
                        Consulte atendimentos anteriores do paciente sem sair do prontuário.
                      </p>
                    </div>

                    <div className="form-group">
                      <label className="font-weight-bold">Procedimentos realizados</label>
                      <p className="small text-muted mb-2">
                        Clique no procedimento para incluir; clique de novo para repetir.
                        Use o − na lista ou as etiquetas abaixo para remover uma ocorrência.
                      </p>
                      {procedimentos.length === 0 ? (
                        <span className="text-muted small d-block">
                          Nenhum procedimento no agendamento.
                        </span>
                      ) : (
                        <DropdownChecklistProcedimentos
                          procedimentos={procedimentos}
                          selecionados={selecionados}
                          onAdicionar={adicionarProc}
                          onRemoverUma={removerUmaProc}
                          onRemoverIndice={removerProcIndice}
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

                    <div className="form-group">
                      <div className="custom-control custom-checkbox">
                        <input
                          type="checkbox"
                          className="custom-control-input"
                          id="agendar-retorno-prontuario"
                          checked={agendarRetorno}
                          onChange={(e) => setAgendarRetorno(e.target.checked)}
                          disabled={salvando}
                        />
                        <label
                          className="custom-control-label"
                          htmlFor="agendar-retorno-prontuario"
                        >
                          Paciente precisará de retorno (curativo)
                        </label>
                      </div>
                      <p className="small text-muted mb-0 ml-4 pl-2">
                        A recepção deverá agendar o retorno no caixa antes de registrar o
                        pagamento deste atendimento.
                      </p>
                    </div>

                    <div className="form-group mb-0">
                      <label className="font-weight-bold d-block">Fotos (até {MAX_FOTOS})</label>
                      <p className="small text-muted mb-2">
                        Anexe até {MAX_FOTOS} imagens no total (incluindo as já salvas). No envio,
                        as fotos são comprimidas para caber no limite do servidor (útil em fotos do
                        celular).
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
                  {salvando
                    ? "Salvando…"
                    : somenteConsultaRealizado
                      ? "Salvar alterações"
                      : "Salvar prontuário"}
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

      <ModalProntuarioHistorico
        open={modalHistoricoAberto}
        pacienteNome={ag.paciente_nome}
        idAgendamentoAtual={ag.id}
        historico={historico}
        onClose={() => setModalHistoricoAberto(false)}
      />
    </>
  );
}
