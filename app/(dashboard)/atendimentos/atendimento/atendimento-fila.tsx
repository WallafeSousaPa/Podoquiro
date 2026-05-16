"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ModalAnamneseAgenda,
  type AnamneseAgendamentoContext,
} from "../../inicio/modal-anamnese-agenda";
import { ModalProntuarioPodologo } from "../../inicio/modal-prontuario-podologo";
import "../../inicio/agenda.css";
import "./atendimento-fila.css";

type AgendamentoDia = {
  id: number;
  id_usuario: number;
  id_paciente: number;
  paciente_nome: string;
  nome_sala: string;
  data_hora_inicio: string;
  data_hora_fim: string;
  status: string;
  anamnese_bloqueada?: boolean;
  anamnese_bloqueio_texto?: string | null;
};

type UsuarioCol = {
  id: number;
  nome: string;
  card_cor?: string | null;
};

function hexCorValida(v: string | null | undefined): v is string {
  return typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v.trim());
}

const ORDEM_STATUS: Record<string, number> = {
  em_andamento: 0,
  pendente: 1,
  confirmado: 1,
  realizado: 2,
  cancelado: 3,
  faltou: 3,
  adiado: 4,
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rotuloStatus(status: string): string {
  switch (status) {
    case "pendente":
      return "Aguardando";
    case "confirmado":
      return "Confirmado";
    case "em_andamento":
      return "Em andamento";
    case "realizado":
      return "Finalizado";
    case "cancelado":
      return "Cancelado";
    case "faltou":
      return "Faltou";
    case "adiado":
      return "Adiado";
    default:
      return status;
  }
}

function classeStatus(status: string): string {
  if (status === "em_andamento") return "andamento";
  if (status === "realizado") return "finalizado";
  if (status === "faltou") return "faltou";
  return "aguardando";
}

export function AtendimentoFila() {
  const router = useRouter();
  const filaRef = useRef<HTMLDivElement | null>(null);
  const [dataDia, setDataDia] = useState(() => toYmd(new Date()));
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agendamentos, setAgendamentos] = useState<AgendamentoDia[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioCol[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [salvandoId, setSalvandoId] = useState<number | null>(null);
  const [prontuarioAg, setProntuarioAg] = useState<AgendamentoDia | null>(null);
  const [finalizarAposProntuarioId, setFinalizarAposProntuarioId] = useState<number | null>(
    null,
  );
  const [anamneseAg, setAnamneseAg] = useState<AnamneseAgendamentoContext | null>(null);
  const [modoFoco, setModoFoco] = useState(false);

  const cardsOrdenados = useMemo(() => {
    return [...agendamentos].sort((a, b) => {
      const oa = ORDEM_STATUS[a.status] ?? 99;
      const ob = ORDEM_STATUS[b.status] ?? 99;
      if (oa !== ob) return oa - ob;
      return (
        new Date(a.data_hora_inicio).getTime() - new Date(b.data_hora_inicio).getTime()
      );
    });
  }, [agendamentos]);

  const refetchAgendamentos = useCallback(async () => {
    try {
      const res = await fetch(`/api/agenda/dia?data=${encodeURIComponent(dataDia)}`);
      const json = (await res.json()) as {
        error?: string;
        agendamentos?: AgendamentoDia[];
        usuarios?: UsuarioCol[];
      };
      if (!res.ok) return;
      setAgendamentos(json.agendamentos ?? []);
      setUsuarios(json.usuarios ?? []);
    } catch {
      /* silencioso */
    }
  }, [dataDia]);

  const moverFila = useCallback(
    (direcao: 1 | -1) => {
      if (cardsOrdenados.length === 0) return;

      const idxAtual = cardsOrdenados.findIndex((c) => c.id === activeId);
      const idxBase = idxAtual >= 0 ? idxAtual : 0;
      const idxNovo = Math.max(
        0,
        Math.min(cardsOrdenados.length - 1, idxBase + direcao),
      );
      const proximo = cardsOrdenados[idxNovo];
      if (!proximo) return;

      setActiveId(proximo.id);

      if (!filaRef.current) return;
      const target = filaRef.current.querySelector<HTMLElement>(
        `[data-card-id="${proximo.id}"]`,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [cardsOrdenados, activeId],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moverFila(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moverFila(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moverFila]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setErro(null);
      try {
        const res = await fetch(`/api/agenda/dia?data=${encodeURIComponent(dataDia)}`);
        const json = (await res.json()) as {
          error?: string;
          agendamentos?: AgendamentoDia[];
          usuarios?: UsuarioCol[];
        };
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar atendimentos.");
        if (!mounted) return;
        const lista = json.agendamentos ?? [];
        setAgendamentos(lista);
        setUsuarios(json.usuarios ?? []);
        const emAndamento = lista.find((a) => a.status === "em_andamento");
        setActiveId(emAndamento?.id ?? lista[0]?.id ?? null);
      } catch (e) {
        if (!mounted) return;
        setErro(e instanceof Error ? e.message : "Erro ao carregar atendimentos.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [dataDia]);

  useEffect(() => {
    if (!activeId || !filaRef.current) return;
    const target = filaRef.current.querySelector<HTMLElement>(`[data-card-id="${activeId}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeId, cardsOrdenados.length]);

  useEffect(() => {
    const fila = filaRef.current;
    if (!fila) return;
    const onScroll = () => {
      const cards = Array.from(
        fila.querySelectorAll<HTMLElement>(".card-atendimento"),
      );
      if (cards.length === 0) return;
      const center = fila.scrollTop + fila.offsetHeight / 2;
      let atual: number | null = null;
      for (const card of cards) {
        const top = card.offsetTop;
        const bottom = top + card.offsetHeight;
        if (center >= top && center <= bottom) {
          const val = Number(card.dataset.cardId);
          atual = Number.isFinite(val) ? val : null;
          break;
        }
      }
      if (atual != null) setActiveId(atual);
    };
    fila.addEventListener("scroll", onScroll);
    return () => fila.removeEventListener("scroll", onScroll);
  }, []);

  async function atualizarStatus(ag: AgendamentoDia, novoStatus: "em_andamento" | "realizado") {
    setSalvandoId(ag.id);
    setErro(null);
    try {
      const res = await fetch(`/api/agendamentos/${ag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao atualizar status.");
      setAgendamentos((prev) =>
        prev.map((item) => (item.id === ag.id ? { ...item, status: novoStatus } : item)),
      );
      setActiveId(ag.id);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao atualizar status.");
    } finally {
      setSalvandoId(null);
    }
  }

  function abrirProntuarioParaFinalizar(ag: AgendamentoDia) {
    setFinalizarAposProntuarioId(ag.id);
    setProntuarioAg(ag);
  }

  return (
    <div className={`atendimento-fila-page ${modoFoco ? "modo-foco" : ""}`}>
      {!modoFoco ? (
        <div className="d-flex justify-content-between align-items-stretch align-items-sm-center flex-column flex-sm-row flex-wrap gap-3 mb-3">
          <h2 className="h5 m-0 align-self-start">Fila de atendimentos</h2>
          <div className="d-flex flex-column flex-sm-row align-items-stretch align-items-sm-center gap-2 flex-grow-1 flex-sm-grow-0">
            <div className="d-flex align-items-center gap-2">
              <label htmlFor="atendimento-data" className="mb-0 text-muted small text-nowrap">
                Data
              </label>
              <input
                id="atendimento-data"
                type="date"
                className="form-control form-control-sm flex-grow-1"
                style={{ minWidth: "10rem" }}
                value={dataDia}
                onChange={(e) => setDataDia(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-success atendimento-fila-btn-modo-foco text-nowrap mt-3 mt-sm-0 ml-sm-4"
              onClick={() => setModoFoco(true)}
            >
              <i className="fas fa-mobile-alt mr-2" aria-hidden />
              Modo foco
            </button>
          </div>
        </div>
      ) : (
        <div className="atendimento-fila-foco-topbar">
          <button
            type="button"
            className="btn btn-sm btn-light"
            onClick={() => setModoFoco(false)}
          >
            Sair do modo foco
          </button>
        </div>
      )}

      {erro ? (
        <div className="alert alert-danger py-2" role="alert">
          {erro}
        </div>
      ) : null}

      {loading ? (
        <div className="card p-4 text-center text-muted">Carregando atendimentos...</div>
      ) : cardsOrdenados.length === 0 ? (
        <div className="card p-4 text-center text-muted">
          Nenhum atendimento encontrado para a data selecionada.
        </div>
      ) : (
        <div className="wrapper-atendimento">
          <div className="nav-controls">
            <button className="btn-nav" onClick={() => moverFila(-1)} aria-label="Subir fila">
              ▲
            </button>
            <button className="btn-nav" onClick={() => moverFila(1)} aria-label="Descer fila">
              ▼
            </button>
          </div>

          <div className="carrossel-vertical" ref={filaRef}>
            <div className="spacer" />
            {cardsOrdenados.map((ag) => {
              const isActive = activeId === ag.id;
              const statusClass = classeStatus(ag.status);
              const isPendente = ag.status === "pendente" || ag.status === "confirmado";
              const isAndamento = ag.status === "em_andamento";
              const isRealizado = ag.status === "realizado";
              const bloqueiaAnamnese = !isRealizado && ag.anamnese_bloqueada === true;
              const cardHabilitado = isActive;
              const responsavel = usuarios.find((u) => u.id === ag.id_usuario);
              const nomeResponsavel = responsavel?.nome ?? "Responsável";
              const corResponsavel = hexCorValida(responsavel?.card_cor)
                ? responsavel.card_cor.trim()
                : undefined;
              return (
                <article
                  key={ag.id}
                  data-card-id={ag.id}
                  className={`card-atendimento ${isActive ? "active" : ""}`}
                  onClick={() => setActiveId(ag.id)}
                  style={
                    corResponsavel
                      ? ({ "--card-color": corResponsavel } as CSSProperties)
                      : undefined
                  }
                >
                  <span className={`status-tag ${statusClass}`}>{rotuloStatus(ag.status)}</span>
                  <span className="nome">{ag.paciente_nome}</span>
                  <div className="detalhes">
                    {fmtHora(ag.data_hora_inicio)} às {fmtHora(ag.data_hora_fim)} |{" "}
                    {ag.nome_sala}
                    <br />
                    Responsável: {nomeResponsavel}
                  </div>
                  <div className="acoes">
                    <button
                      className="btn btn-anamnese"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isRealizado) {
                          setProntuarioAg(ag);
                        } else {
                          setAnamneseAg({
                            id: ag.id,
                            id_paciente: ag.id_paciente,
                            paciente_nome: ag.paciente_nome,
                          });
                        }
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      disabled={salvandoId === ag.id || !cardHabilitado || bloqueiaAnamnese}
                      title={
                        bloqueiaAnamnese
                          ? ag.anamnese_bloqueio_texto?.trim() ??
                            "Aguarde o intervalo mínimo entre anamneses."
                          : undefined
                      }
                    >
                      {isRealizado ? "Ver ficha" : "Anamnese"}
                    </button>
                    {isPendente ? (
                      <button
                        className="btn btn-status"
                        onClick={() => void atualizarStatus(ag, "em_andamento")}
                        disabled={salvandoId === ag.id || !cardHabilitado}
                      >
                        {salvandoId === ag.id ? "Salvando..." : "Iniciar"}
                      </button>
                    ) : isAndamento ? (
                      <button
                        className="btn btn-status"
                        onClick={() => abrirProntuarioParaFinalizar(ag)}
                        disabled={salvandoId === ag.id || !cardHabilitado}
                      >
                        Finalizar
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
            <div className="spacer" />
          </div>
        </div>
      )}

      {anamneseAg ? (
        <ModalAnamneseAgenda
          key={`anamnese-${anamneseAg.id}`}
          ag={anamneseAg}
          onClose={() => setAnamneseAg(null)}
          onSalvo={() => {
            router.refresh();
            void refetchAgendamentos();
          }}
        />
      ) : null}

      {prontuarioAg ? (
        <ModalProntuarioPodologo
          ag={prontuarioAg}
          onClose={() => {
            setProntuarioAg(null);
            setFinalizarAposProntuarioId(null);
          }}
          onSalvo={() => {
            const alvo = prontuarioAg;
            setProntuarioAg(null);
            if (alvo && finalizarAposProntuarioId === alvo.id) {
              setFinalizarAposProntuarioId(null);
              void atualizarStatus(alvo, "realizado");
              return;
            }
            setFinalizarAposProntuarioId(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
