"use client";

import { useRouter } from "next/navigation";
import {
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import "./agenda.css";
import { ModalAnamneseAgenda } from "./modal-anamnese-agenda";
import { ModalProntuarioPodologo } from "./modal-prontuario-podologo";
import {
  MSG_HORARIO_RETROATIVO,
  statusAgendamentoIgnoraValidacaoHorario,
} from "@/lib/agenda/validacao-agendamento";
import {
  type VisualizacaoAgenda,
  diasSemanaSegundaADomingo,
  gradeMesSegundaInicio,
  limitesMesInclusive,
  limitesSemanaInclusive,
  nomeDiaSemanaCurto,
  rotuloMesPt,
  rotuloSemanaPt,
} from "@/lib/agenda/datas-agenda";
import { normalizeCpfDigits } from "@/lib/pacientes";

const HORA_INICIO = 8;
const HORA_FIM = 20;
const ALTURA_HORA_PX = 42;
const MINUTOS_POR_LINHA = 30;

/** Instantâneo atual para validações (fora do componente — evita react-hooks/purity em handlers). */
function msRelogioAgora(): number {
  return Date.now();
}

/** Resposta JSON de erro das rotas `/api/agendamentos` (campos opcionais de diagnóstico). */
type RespostaErroApiAgendamento = {
  error?: string;
  debugAgenda?: {
    consulta?: Record<string, unknown>;
    linhasSobrepostas?: Array<Record<string, unknown>>;
  };
};

/** Abre o DevTools → Console para inspecionar conflitos de agenda e o payload enviado. */
function logRespostaErroApiAgendamento(
  origem: string,
  res: Response,
  json: RespostaErroApiAgendamento,
  payload?: unknown,
) {
  const errMsg = json.error ?? "(resposta sem campo `error`)";
  // Uma linha sempre visível (evita confundir com objeto recolhido no Chrome).
  console.warn(`[Podoquiro/agenda] ${origem} | HTTP ${res.status} | ${errMsg}`);
  if (json.debugAgenda != null) {
    console.info(
      `[Podoquiro/agenda] debugAgenda (conflito / diagnóstico — copie se precisar de ajuda):\n${JSON.stringify(json.debugAgenda, null, 2)}`,
    );
  } else {
    console.info(
      "[Podoquiro/agenda] Não há `debugAgenda` nesta resposta (erro não é conflito de agenda na API, ou está em build de produção). Corpo recebido:",
      json,
    );
  }
  if (payload !== undefined) {
    console.info(
      `[Podoquiro/agenda] payload enviado:\n${JSON.stringify(payload, null, 2)}`,
    );
  }
}

type UsuarioCol = {
  id: number;
  nome: string;
  id_grupo_usuarios: number;
  card_cor?: string | null;
};

type PacienteListaItem = {
  id: number;
  nome: string;
  /** Somente dígitos, para busca por CPF no modal. */
  cpfDigits: string;
  telefone: string | null;
};

function apenasDigitosTel(s: string): string {
  return s.replace(/\D/g, "");
}

function formatarTelefoneExibir(tel: string | null | undefined): string {
  if (tel == null || !String(tel).trim()) return "";
  const d = apenasDigitosTel(String(tel));
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return String(tel).trim();
}

/** wa.me a partir do telefone do cadastro (DDD + BR 55 quando aplicável). */
function urlWhatsAppPaciente(tel: string | null | undefined): string | null {
  if (tel == null || !String(tel).trim()) return null;
  const d = apenasDigitosTel(String(tel));
  if (d.length === 0) return null;
  if (d.startsWith("55") && d.length >= 12) return `https://wa.me/${d}`;
  if (d.length >= 10 && d.length <= 11) return `https://wa.me/55${d}`;
  if (d.length >= 8) return `https://wa.me/${d}`;
  return null;
}

/** Mensagem padrão para confirmar horário (data do início + hora de término). */
function montarMensagemWhatsappConfirmacaoHorario(args: {
  nomePaciente: string;
  nomeEmpresa: string;
  inicioLocal: string;
  horaFimLocal: string;
}): string {
  const nomeP = args.nomePaciente.trim() || "paciente";
  const emp = args.nomeEmpresa.trim() || "nossa clínica";
  let dataFmt = "";
  if (args.inicioLocal.trim()) {
    const d = new Date(args.inicioLocal);
    if (!Number.isNaN(d.getTime())) {
      const raw = d.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      dataFmt = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
    }
  }
  const horaFim = args.horaFimLocal.trim() || "—";
  return `Olá, Sr(a) ${nomeP}, aqui é da ${emp}, gostaria de confirmar seu horário de ${dataFmt || "—"} às ${horaFim}.`;
}

type AgendamentoDia = {
  id: number;
  id_usuario: number;
  id_paciente: number;
  id_sala: number;
  paciente_nome: string;
  nome_sala: string;
  data_hora_inicio: string;
  data_hora_fim: string;
  status: string;
  valor_bruto: number;
  desconto: number;
  valor_total: number;
  observacoes: string | null;
};

type ProcCatalogoAgendaItem = {
  id: number;
  procedimento: string;
  valor_total: number;
};

type ModalProcLinhaAgenda = {
  id_procedimento: number;
  valor_aplicado: number;
};

type AgendaProdutoSnapshot = {
  id_produto: string;
  qtd: number;
  valor_desconto: number;
};

/** Grade do calendário: encaixe ao soltar (minutos). */
const SLOT_MINUTOS_AGENDA = 15;

function instantesPorDropNaColuna(
  dataDiaYmd: string,
  clientY: number,
  columnRect: DOMRect,
  duracaoMs: number,
): { inicio: Date; fim: Date } | null {
  if (duracaoMs <= 0) return null;
  const relY = Math.max(0, Math.min(clientY - columnRect.top, columnRect.height));
  const spanMin = (HORA_FIM - HORA_INICIO) * 60;
  const minutosDesdeAbertura = (relY / columnRect.height) * spanMin;
  const snapped =
    Math.round(minutosDesdeAbertura / SLOT_MINUTOS_AGENDA) * SLOT_MINUTOS_AGENDA;
  const totalMinutosDia = HORA_INICIO * 60 + Math.min(Math.max(0, snapped), spanMin);
  const h = Math.floor(totalMinutosDia / 60);
  const mi = totalMinutosDia % 60;
  const parts = dataDiaYmd.split("-").map(Number);
  const [Y, M, D] = parts;
  if (parts.length !== 3 || !Number.isFinite(Y) || !Number.isFinite(M) || !Number.isFinite(D)) {
    return null;
  }
  const inicio = new Date(Y, M - 1, D, h, mi, 0, 0);
  const fim = new Date(inicio.getTime() + duracaoMs);
  return { inicio, fim };
}

function agendamentoMudouAposDrop(
  ag: AgendamentoDia,
  novoUsuarioId: number,
  inicio: Date,
  fim: Date,
): boolean {
  if (ag.id_usuario !== novoUsuarioId) return true;
  const oi = new Date(ag.data_hora_inicio).getTime();
  const of = new Date(ag.data_hora_fim).getTime();
  const ni = inicio.getTime();
  const nf = fim.getTime();
  return Math.abs(oi - ni) > 45_000 || Math.abs(of - nf) > 45_000;
}

function fmtDataHoraPt(d: Date): string {
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Início no dia da agenda, hora encaixada na grade (8h–20h, passo 15 min). */
function inicioNaGradeAgenda(dataDiaYmd: string, horaHHmm: string): Date | null {
  const [Y, M, D] = dataDiaYmd.split("-").map(Number);
  if (!Number.isFinite(Y) || !Number.isFinite(M) || !Number.isFinite(D)) return null;
  const hm = horaHHmm.trim().split(":");
  let minutos = Number(hm[0]) * 60 + Number(hm[1]);
  if (!Number.isFinite(minutos)) return null;
  minutos = Math.round(minutos / SLOT_MINUTOS_AGENDA) * SLOT_MINUTOS_AGENDA;
  const minGRID = HORA_INICIO * 60;
  const maxGRID = HORA_FIM * 60;
  minutos = Math.max(minGRID, Math.min(minutos, maxGRID));
  const h = Math.floor(minutos / 60);
  const mi = minutos % 60;
  return new Date(Y, M - 1, D, h, mi, 0, 0);
}

function ModalBackdrop({
  children,
  onBackdropClick,
  zIndex = 1050,
}: {
  children: ReactNode;
  onBackdropClick: () => void;
  /** Empilha acima de outro modal (ex.: alerta de validação). */
  zIndex?: number;
}) {
  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block", zIndex }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: zIndex - 5 }}
        role="presentation"
        onClick={onBackdropClick}
      />
    </>
  );
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function minutosDoDia(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Valor para `datetime-local` (minutos, sem segundos — alinhado ao controle nativo). */
function toDatetimeLocalValue(d: Date): string {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

function instanteMinimoInicio(): Date {
  const n = new Date();
  n.setSeconds(0, 0);
  n.setMilliseconds(0);
  return n;
}

function formatHoraLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hexCorValida(v: string | null | undefined): v is string {
  return typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v.trim());
}

function adicionarMinutos(d: Date, minutos: number): Date {
  return new Date(d.getTime() + minutos * 60 * 1000);
}

/**
 * Monta o instante de término usando a data do início + hora (HH:mm).
 * Se o resultado não for estritamente após o início no mesmo dia, avança um dia
 * (ex.: início 23:45 e fim 00:15 → dia seguinte).
 */
function fimAPartirDeInicioEHora(inicioLocal: string, horaFimHHmm: string): Date {
  const inicio = new Date(inicioLocal);
  const parts = horaFimHHmm.trim().split(":");
  const h = Number(parts[0]);
  const mi = Number(parts[1]);
  if (Number.isNaN(inicio.getTime()) || !Number.isFinite(h) || !Number.isFinite(mi)) {
    return new Date(NaN);
  }
  const fim = new Date(inicio);
  fim.setHours(h, mi, 0, 0);
  if (fim.getTime() <= inicio.getTime()) {
    fim.setDate(fim.getDate() + 1);
  }
  return fim;
}

function estiloEvento(inicioIso: string, fimIso: string): { top: string; height: string } {
  const a = new Date(inicioIso);
  const b = new Date(fimIso);
  const base = HORA_INICIO * 60;
  const span = HORA_FIM * 60 - base;
  let sm = minutosDoDia(a) - base;
  let em = minutosDoDia(b) - base;
  sm = Math.max(0, Math.min(span, sm));
  em = Math.max(0, Math.min(span, em));
  if (em <= sm) em = sm + 15;
  const top = (sm / span) * 100;
  const h = Math.max(16.8, ((em - sm) / span) * 100);
  return { top: `${top}%`, height: `${h}%` };
}

type DensidadeCardAgenda = "compact" | "medium" | "full";

function densidadeCardPorAlturaPercent(alturaPercent: number): DensidadeCardAgenda {
  if (alturaPercent < 13.5) return "compact";
  if (alturaPercent < 18.5) return "medium";
  return "full";
}

function classeStatus(status: string): string {
  if (status === "cancelado" || status === "faltou") return "busy";
  if (status === "realizado") return "done";
  if (status === "adiado") return "warn";
  if (status === "confirmado") return "confirmed";
  return "";
}

function rotuloStatusAgendamento(status: string): string {
  switch (status) {
    case "pendente":
      return "Pendente";
    case "confirmado":
      return "Confirmado";
    case "em_andamento":
      return "Em andamento";
    case "realizado":
      return "Realizado";
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

function iconeStatusAgendamento(status: string): {
  iconClass: string;
  badgeClass: string;
  label: string;
} {
  switch (status) {
    case "pendente":
      return {
        iconClass: "far fa-clock",
        badgeClass: "agenda-status-badge--pendente",
        label: "Pendente",
      };
    case "confirmado":
      return {
        iconClass: "fas fa-check-circle",
        badgeClass: "agenda-status-badge--confirmado",
        label: "Confirmado",
      };
    case "em_andamento":
      return {
        iconClass: "fas fa-play-circle",
        badgeClass: "agenda-status-badge--andamento",
        label: "Em andamento",
      };
    case "realizado":
      return {
        iconClass: "fas fa-check-double",
        badgeClass: "agenda-status-badge--realizado",
        label: "Realizado",
      };
    case "cancelado":
      return {
        iconClass: "fas fa-times-circle",
        badgeClass: "agenda-status-badge--cancelado",
        label: "Cancelado",
      };
    case "faltou":
      return {
        iconClass: "fas fa-user-slash",
        badgeClass: "agenda-status-badge--faltou",
        label: "Faltou",
      };
    case "adiado":
      return {
        iconClass: "fas fa-exclamation-circle",
        badgeClass: "agenda-status-badge--adiado",
        label: "Adiado",
      };
    default:
      return {
        iconClass: "far fa-circle",
        badgeClass: "agenda-status-badge--pendente",
        label: status,
      };
  }
}

type Props = {
  idEmpresa: string;
  /** Nome fantasia da empresa (mensagem WhatsApp). */
  nomeEmpresa: string;
  /** Perfil Podólogo: oculta Agendar + e Parametrização na toolbar. */
  somenteMenuInicio?: boolean;
  /** Exceção para agendar horários retroativos (Administrador/Administrativo). */
  podeAgendarRetroativo?: boolean;
};

export function AgendaCalendario({
  idEmpresa,
  nomeEmpresa,
  somenteMenuInicio = false,
  podeAgendarRetroativo = false,
}: Props) {
  const router = useRouter();
  const modalId = useId();
  const modalParametrizacaoTitleId = useId();
  const modalAtalhoMoverTitleId = useId();
  const modalPodologoAtendimentoTitleId = useId();

  const [dataDia, setDataDia] = useState(() => toYmd(new Date()));
  const [visualizacao, setVisualizacao] = useState<VisualizacaoAgenda>("dia");
  const [usuarios, setUsuarios] = useState<UsuarioCol[]>([]);
  const [agendamentos, setAgendamentos] = useState<AgendamentoDia[]>([]);
  const [agendaGruposConfigurados, setAgendaGruposConfigurados] = useState(false);
  const [ocultarSecaoPagamentosAgenda, setOcultarSecaoPagamentosAgenda] =
    useState(false);
  const [perfilAdminAgenda, setPerfilAdminAgenda] = useState(false);
  const [modalAtendimentoPodologo, setModalAtendimentoPodologo] =
    useState<AgendamentoDia | null>(null);
  const [iniciandoAtendimentoPodologo, setIniciandoAtendimentoPodologo] =
    useState(false);
  const [salvandoStatusMenuAgId, setSalvandoStatusMenuAgId] = useState<number | null>(
    null,
  );
  const [finalizarAposProntuarioId, setFinalizarAposProntuarioId] = useState<
    number | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [gruposTodos, setGruposTodos] = useState<{ id: number; grupo_usuarios: string }[]>([]);
  const [gruposSelecionados, setGruposSelecionados] = useState<Set<number>>(new Set());
  const [salvandoGrupos, setSalvandoGrupos] = useState(false);
  const [modalParametrizacaoOpen, setModalParametrizacaoOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pacientes, setPacientes] = useState<PacienteListaItem[]>([]);
  const [salas, setSalas] = useState<{ id: number; nome: string }[]>([]);
  const [idUsuario, setIdUsuario] = useState("");
  const [idPaciente, setIdPaciente] = useState("");
  const [pacienteBusca, setPacienteBusca] = useState("");
  const [pacienteListaAberta, setPacienteListaAberta] = useState(false);
  const [idSala, setIdSala] = useState("");
  const [inicioLocal, setInicioLocal] = useState("");
  /** Somente hora (HH:mm); a data do término segue a do início. */
  const [horaFimLocal, setHoraFimLocal] = useState("");
  const [statusAg, setStatusAg] = useState<string>("pendente");
  const [desconto, setDesconto] = useState("0");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** Mensagens de validação / API ao salvar (modal sobre o formulário). */
  const [erroModal, setErroModal] = useState<string | null>(null);

  const [procCatalogoAgenda, setProcCatalogoAgenda] = useState<ProcCatalogoAgendaItem[]>(
    [],
  );
  const [modalProcLinhas, setModalProcLinhas] = useState<ModalProcLinhaAgenda[]>([]);
  const [procAgendaDirty, setProcAgendaDirty] = useState(false);
  const [agendaProdutosSnapshot, setAgendaProdutosSnapshot] = useState<
    AgendaProdutoSnapshot[]
  >([]);

  const [pendenteMover, setPendenteMover] = useState<{
    ag: AgendamentoDia;
    novoUsuarioId: number;
    novoUsuarioNome: string;
    inicioIso: string;
    fimIso: string;
  } | null>(null);
  const [salvandoMover, setSalvandoMover] = useState(false);
  const [colunaDropHoverId, setColunaDropHoverId] = useState<number | null>(null);
  /** Evita abrir o modal de edição após soltar um arraste no mesmo card. */
  const dragAgRef = useRef<{ id: number | null; moveu: boolean }>({
    id: null,
    moveu: false,
  });

  /** Menu ⋮ no card (atalhos em telas touch). */
  const [menuCardAbertoId, setMenuCardAbertoId] = useState<number | null>(null);
  /** Modal “Mover…”: escolher responsável e hora sem arrastar. */
  const [atalhoMover, setAtalhoMover] = useState<{
    ag: AgendamentoDia;
    idUsuario: string;
    horaInicio: string;
  } | null>(null);
  const [anamneseAgModal, setAnamneseAgModal] = useState<AgendamentoDia | null>(null);

  useEffect(() => {
    if (menuCardAbertoId == null) return;
    const fechar = (ev: MouseEvent) => {
      const el = ev.target;
      if (el instanceof Element && el.closest(".agenda-appointment-menu-wrap")) return;
      setMenuCardAbertoId(null);
    };
    window.addEventListener("click", fechar, true);
    return () => window.removeEventListener("click", fechar, true);
  }, [menuCardAbertoId]);

  const linhasVisiveis = useMemo(() => {
    const linhas: { totalMinutos: number; label: string }[] = [];
    const totalMinutos = (HORA_FIM - HORA_INICIO) * 60;
    for (let m = 0; m < totalMinutos; m += MINUTOS_POR_LINHA) {
      const abs = HORA_INICIO * 60 + m;
      const hh = String(Math.floor(abs / 60)).padStart(2, "0");
      const mm = String(abs % 60).padStart(2, "0");
      linhas.push({ totalMinutos: abs, label: `${hh}:${mm}` });
    }
    return linhas;
  }, []);

  const alturaLinhaPx = (ALTURA_HORA_PX * MINUTOS_POR_LINHA) / 60;
  const alturaColunaPx = linhasVisiveis.length * alturaLinhaPx;

  const limitesSem = useMemo(() => limitesSemanaInclusive(dataDia), [dataDia]);
  const diasSemanaYmd = useMemo(
    () => diasSemanaSegundaADomingo(limitesSem.inicio),
    [limitesSem.inicio],
  );
  const refMesD = useMemo(() => new Date(`${dataDia}T12:00:00`), [dataDia]);
  const gradeMes = useMemo(
    () => gradeMesSegundaInicio(refMesD.getFullYear(), refMesD.getMonth() + 1),
    [refMesD],
  );
  const corCardUsuario = useMemo(
    () =>
      Object.fromEntries(
        usuarios.map((u) => [u.id, hexCorValida(u.card_cor) ? u.card_cor : null]),
      ) as Record<number, string | null>,
    [usuarios],
  );

  const pacientesFiltrados = useMemo(() => {
    const raw = pacienteBusca.trim();
    if (!raw) return [];
    const qNome = raw.toLowerCase();
    const qCpf = normalizeCpfDigits(raw);
    return pacientes.filter((p) => {
      if (p.nome.toLowerCase().includes(qNome)) return true;
      if (qCpf.length >= 3 && p.cpfDigits.includes(qCpf)) return true;
      return false;
    });
  }, [pacientes, pacienteBusca]);

  const pacienteSelecionado = useMemo(() => {
    if (!idPaciente) return null;
    const id = Number(idPaciente);
    if (!Number.isFinite(id) || id <= 0) return null;
    return pacientes.find((p) => p.id === id) ?? null;
  }, [idPaciente, pacientes]);

  const urlWhatsPacienteSelecionado = useMemo(() => {
    const base = urlWhatsAppPaciente(pacienteSelecionado?.telefone ?? null);
    if (!base || !pacienteSelecionado) return null;
    const texto = montarMensagemWhatsappConfirmacaoHorario({
      nomePaciente: pacienteSelecionado.nome,
      nomeEmpresa,
      inicioLocal,
      horaFimLocal,
    });
    return `${base}?text=${encodeURIComponent(texto)}`;
  }, [pacienteSelecionado, nomeEmpresa, inicioLocal, horaFimLocal]);

  const erroFimMenorQueInicio = useMemo(() => {
    if (!inicioLocal.trim() || !horaFimLocal.trim()) return false;
    const inicio = new Date(inicioLocal);
    if (Number.isNaN(inicio.getTime())) return false;
    const partesFim = horaFimLocal.split(":");
    const hFim = Number(partesFim[0]);
    const mFim = Number(partesFim[1]);
    if (!Number.isFinite(hFim) || !Number.isFinite(mFim)) return false;
    const inicioMin = inicio.getHours() * 60 + inicio.getMinutes();
    const fimMin = hFim * 60 + mFim;
    return fimMin <= inicioMin;
  }, [inicioLocal, horaFimLocal]);

  const loadAgenda = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      let url: string;
      if (visualizacao === "dia") {
        url = `/api/agenda/dia?data=${encodeURIComponent(dataDia)}`;
      } else {
        const { inicio, fim } =
          visualizacao === "semana"
            ? limitesSemanaInclusive(dataDia)
            : limitesMesInclusive(dataDia);
        url = `/api/agenda/periodo?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`;
      }
      const res = await fetch(url);
      const json = (await res.json()) as {
        error?: string;
        usuarios?: UsuarioCol[];
        agendamentos?: AgendamentoDia[];
        agendaGruposConfigurados?: boolean;
        ocultarSecaoPagamentosAgenda?: boolean;
        perfil_admin_agenda?: boolean;
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar agenda.");
      setUsuarios(json.usuarios ?? []);
      setAgendamentos(json.agendamentos ?? []);
      setAgendaGruposConfigurados(!!json.agendaGruposConfigurados);
      setOcultarSecaoPagamentosAgenda(!!json.ocultarSecaoPagamentosAgenda);
      setPerfilAdminAgenda(json.perfil_admin_agenda === true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [dataDia, visualizacao]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void loadAgenda();
    });
    return () => cancelAnimationFrame(id);
  }, [loadAgenda]);

  useEffect(() => {
    if (!modalOpen || !perfilAdminAgenda) {
      setProcCatalogoAgenda([]);
      return;
    }
    const iu = Number(idUsuario);
    if (!Number.isFinite(iu) || iu <= 0) {
      setProcCatalogoAgenda([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/procedimentos?id_usuario=${encodeURIComponent(String(iu))}`,
        );
        const j = (await res.json()) as {
          data?: { id: number; procedimento: string; valor_total: number }[];
          error?: string;
        };
        if (!res.ok || cancelled) return;
        setProcCatalogoAgenda(
          (j.data ?? []).map((p) => ({
            id: p.id,
            procedimento: p.procedimento,
            valor_total: Number(p.valor_total),
          })),
        );
      } catch {
        if (!cancelled) setProcCatalogoAgenda([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, perfilAdminAgenda, idUsuario]);

  useEffect(() => {
    void (async () => {
      try {
        const [gRes, cfgRes] = await Promise.all([
          fetch("/api/usuarios-grupos"),
          fetch("/api/empresa-agenda-grupos"),
        ]);
        const gJson = (await gRes.json()) as {
          data?: { id: number; grupo_usuarios: string; ativo: boolean }[];
        };
        const cJson = (await cfgRes.json()) as { data?: { id_grupo_usuarios: number }[] };
        const todos = (gJson.data ?? []).filter((g) => g.ativo);
        setGruposTodos(todos.map((g) => ({ id: g.id, grupo_usuarios: g.grupo_usuarios })));
        if (cJson.data?.length) {
          setGruposSelecionados(new Set(cJson.data.map((x) => x.id_grupo_usuarios)));
        } else {
          setGruposSelecionados(new Set());
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function salvarGruposAgenda() {
    setSalvandoGrupos(true);
    try {
      const res = await fetch("/api/empresa-agenda-grupos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids_grupo_usuarios: [...gruposSelecionados] }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar grupos.");
      setModalParametrizacaoOpen(false);
      router.refresh();
      void loadAgenda();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Erro ao salvar grupos.");
    } finally {
      setSalvandoGrupos(false);
    }
  }

  function toggleGrupo(id: number) {
    setGruposSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function carregarListasAuxiliares() {
    const [pr, sa] = await Promise.all([fetch("/api/pacientes"), fetch("/api/salas")]);
    const pj = (await pr.json()) as {
      data?: {
        id: number;
        cpf: string | null;
        nome_completo: string | null;
        nome_social: string | null;
        telefone: string | null;
      }[];
    };
    const sj = (await sa.json()) as {
      data?: { id: number; id_empresa: number; nome_sala: string }[];
    };

    const emp = Number(idEmpresa);
    setPacientes(
      (pj.data ?? []).map((p) => {
        const tel = p.telefone != null ? String(p.telefone).trim() : "";
        return {
          id: p.id,
          nome:
            (p.nome_completo && p.nome_completo.trim()) ||
            (p.nome_social && p.nome_social.trim()) ||
            `Paciente #${p.id}`,
          cpfDigits: normalizeCpfDigits(p.cpf),
          telefone: tel === "" ? null : tel,
        };
      }),
    );
    setSalas(
      (sj.data ?? [])
        .filter((s) => s.id_empresa === emp)
        .map((s) => ({ id: s.id, nome: s.nome_sala })),
    );
  }

  async function abrirNovo(preUsuarioId?: number) {
    setEditingId(null);
    setFormError(null);
    setErroModal(null);
    setStatusAg("pendente");
    setDesconto("0");
    setObservacoes("");
    setModalProcLinhas([]);
    setProcAgendaDirty(false);
    setAgendaProdutosSnapshot([]);
    setProcCatalogoAgenda([]);

    try {
      await carregarListasAuxiliares();
    } catch {
      setFormError("Não foi possível carregar listas auxiliares.");
    }

    const defUser =
      preUsuarioId && usuarios.some((u) => u.id === preUsuarioId)
        ? String(preUsuarioId)
        : usuarios[0]
          ? String(usuarios[0].id)
          : "";
    setIdUsuario(defUser);
    setIdPaciente("");
    setPacienteBusca("");
    setPacienteListaAberta(false);
    setIdSala("");

    const agora = instanteMinimoInicio();
    let base = new Date(`${dataDia}T09:00:00`);
    if (base.getTime() < agora.getTime()) {
      base = agora;
    }
    setInicioLocal(toDatetimeLocalValue(base));
    setHoraFimLocal(formatHoraLocal(adicionarMinutos(base, 30)));

    setModalOpen(true);
  }

  function selecionarPaciente(p: PacienteListaItem) {
    setIdPaciente(String(p.id));
    setPacienteBusca(p.nome);
    setPacienteListaAberta(false);
  }

  function addProcLinhaAgenda() {
    const primeiro = procCatalogoAgenda[0];
    if (!primeiro) return;
    setModalProcLinhas((prev) => [
      ...prev,
      {
        id_procedimento: primeiro.id,
        valor_aplicado: primeiro.valor_total,
      },
    ]);
    setProcAgendaDirty(true);
  }

  async function abrirEditar(ag: AgendamentoDia) {
    setFormError(null);
    setErroModal(null);
    setEditingId(ag.id);
    setModalOpen(true);
    try {
      await carregarListasAuxiliares();
      const res = await fetch(`/api/agendamentos/${ag.id}`);
      const json = (await res.json()) as {
        error?: string;
        data?: {
          id_usuario: number;
          id_paciente: number;
          id_sala: number;
          data_hora_inicio: string;
          data_hora_fim: string;
          status: string;
          desconto: number;
          observacoes: string | null;
          procedimentos: {
            id_procedimento: number;
            valor_aplicado: number;
          }[];
          produtos: {
            id_produto: string;
            qtd: number;
            valor_desconto: number;
          }[];
        };
      };
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar agendamento.");
      const d = json.data;
      if (!d) return;

      setModalProcLinhas(
        (d.procedimentos ?? []).map((p) => ({
          id_procedimento: p.id_procedimento,
          valor_aplicado: Number(p.valor_aplicado),
        })),
      );
      setProcAgendaDirty(false);
      setAgendaProdutosSnapshot(
        (d.produtos ?? []).map((p) => ({
          id_produto: String(p.id_produto),
          qtd: Number(p.qtd),
          valor_desconto: Number(p.valor_desconto ?? 0),
        })),
      );
      setIdUsuario(String(d.id_usuario));
      setIdPaciente(String(d.id_paciente));
      setPacienteBusca(ag.paciente_nome);
      setPacienteListaAberta(false);
      setIdSala(String(d.id_sala));
      const a = new Date(d.data_hora_inicio);
      const b = new Date(d.data_hora_fim);
      const pad = (n: number) => String(n).padStart(2, "0");
      const loc = (x: Date) =>
        `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
      setInicioLocal(loc(a));
      setHoraFimLocal(formatHoraLocal(b));
      setStatusAg(d.status);
      setDesconto(String(d.desconto));
      setObservacoes(d.observacoes ?? "");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro.");
    }
  }

  function aoClicarCalendarioAgendamento(ag: AgendamentoDia) {
    setMenuCardAbertoId(null);
    if (ocultarSecaoPagamentosAgenda) {
      setModalAtendimentoPodologo(ag);
      return;
    }
    void abrirEditar(ag);
  }

  async function executarIniciarAtendimentoPodologo() {
    if (
      !modalAtendimentoPodologo ||
      (modalAtendimentoPodologo.status !== "pendente" &&
        modalAtendimentoPodologo.status !== "confirmado")
    ) {
      return;
    }
    setIniciandoAtendimentoPodologo(true);
    setErroModal(null);
    try {
      const res = await fetch(`/api/agendamentos/${modalAtendimentoPodologo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "em_andamento" }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao iniciar atendimento.");
      setModalAtendimentoPodologo(null);
      router.refresh();
      void loadAgenda();
    } catch (e) {
      setErroModal(e instanceof Error ? e.message : "Erro ao iniciar atendimento.");
    } finally {
      setIniciandoAtendimentoPodologo(false);
    }
  }

  async function colocarEmAndamentoDesdeMenu(ag: AgendamentoDia) {
    if (ag.status !== "pendente" && ag.status !== "confirmado") return;
    setMenuCardAbertoId(null);
    setSalvandoStatusMenuAgId(ag.id);
    setErroModal(null);
    try {
      const res = await fetch(`/api/agendamentos/${ag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "em_andamento" }),
      });
      const j = (await res.json()) as RespostaErroApiAgendamento;
      if (!res.ok) {
        logRespostaErroApiAgendamento(
          "PATCH colocar em andamento (menu agenda)",
          res,
          j,
          { status: "em_andamento" },
        );
        throw new Error(j.error ?? "Erro ao colocar em andamento.");
      }
      router.refresh();
      void loadAgenda();
    } catch (e) {
      setErroModal(e instanceof Error ? e.message : "Erro ao colocar em andamento.");
    } finally {
      setSalvandoStatusMenuAgId(null);
    }
  }

  function abrirProntuarioFinalizarDesdeMenu(ag: AgendamentoDia) {
    if (ag.status !== "em_andamento") return;
    setMenuCardAbertoId(null);
    setFinalizarAposProntuarioId(ag.id);
    setModalAtendimentoPodologo(ag);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setErroModal(null);
    try {
      const iu = Number(idUsuario);
      const ip = Number(idPaciente);
      const isl = Number(idSala);
      if (!Number.isFinite(iu) || !Number.isFinite(isl)) {
        setErroModal("Preencha profissional e sala.");
        return;
      }
      if (!Number.isFinite(ip) || ip <= 0) {
        setErroModal("Busque e selecione um paciente na lista.");
        return;
      }
      const inicioD = new Date(inicioLocal);
      const fimD = fimAPartirDeInicioEHora(inicioLocal, horaFimLocal);
      const tInicio = inicioD.getTime();
      const tFim = fimD.getTime();
      const fimPartes = horaFimLocal.trim().split(":");
      const hFim = Number(fimPartes[0]);
      const mFim = Number(fimPartes[1]);
      const inicioMin = inicioD.getHours() * 60 + inicioD.getMinutes();
      const fimMin = hFim * 60 + mFim;
      if (!statusAgendamentoIgnoraValidacaoHorario(statusAg)) {
        if (
          Number.isNaN(tInicio) ||
          Number.isNaN(tFim) ||
          !Number.isFinite(hFim) ||
          !Number.isFinite(mFim) ||
          fimMin <= inicioMin ||
          tFim <= tInicio ||
          !horaFimLocal.trim()
        ) {
          setErroModal("O horário de fim deve ser maior que o horário de início.");
          return;
        }
        if (!podeAgendarRetroativo && !editingId && tInicio < msRelogioAgora()) {
          setErroModal(MSG_HORARIO_RETROATIVO);
          return;
        }
      }
      const inicioIso = inicioD.toISOString();
      const fimIso = fimD.toISOString();
      const body: Record<string, unknown> = {
        id_usuario: iu,
        id_paciente: ip,
        id_sala: isl,
        data_hora_inicio: inicioIso,
        data_hora_fim: fimIso,
        status: statusAg,
        desconto: Number(desconto.replace(",", ".")) || 0,
        observacoes: observacoes.trim() || null,
      };

      if (perfilAdminAgenda && procAgendaDirty) {
        if (editingId && modalProcLinhas.length === 0) {
          setErroModal(
            "Ao editar, mantenha ao menos um procedimento na lista (ou recarregue o agendamento sem alterar procedimentos).",
          );
          return;
        }
        if (modalProcLinhas.length > 0) {
          body.procedimentos = modalProcLinhas.map((p) => ({
            id_procedimento: p.id_procedimento,
            valor_aplicado: p.valor_aplicado,
          }));
          if (editingId) {
            body.produtos = agendaProdutosSnapshot.map((p) => ({
              id_produto: p.id_produto,
              qtd: p.qtd,
              valor_desconto: p.valor_desconto,
            }));
          }
        }
      }

      const url = editingId ? `/api/agendamentos/${editingId}` : "/api/agendamentos";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as RespostaErroApiAgendamento;
      if (!res.ok) {
        logRespostaErroApiAgendamento(
          editingId ? "PATCH salvar edição" : "POST novo agendamento",
          res,
          json,
          body,
        );
        setErroModal(json.error ?? "Erro ao salvar.");
        return;
      }
      setModalOpen(false);
      router.refresh();
      void loadAgenda();
    } catch (err) {
      setErroModal(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function aplicarMoverAgendamento() {
    if (!pendenteMover || salvandoMover) return;
    setSalvandoMover(true);
    try {
      const moverPayload = {
        id_usuario: pendenteMover.novoUsuarioId,
        data_hora_inicio: pendenteMover.inicioIso,
        data_hora_fim: pendenteMover.fimIso,
      };
      const res = await fetch(`/api/agendamentos/${pendenteMover.ag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(moverPayload),
      });
      const json = (await res.json()) as RespostaErroApiAgendamento;
      if (!res.ok) {
        logRespostaErroApiAgendamento("PATCH mover arrastar-soltar", res, json, moverPayload);
        setPendenteMover(null);
        setErroModal(json.error ?? "Erro ao salvar.");
        return;
      }
      setPendenteMover(null);
      router.refresh();
      void loadAgenda();
    } catch (e) {
      setPendenteMover(null);
      setErroModal(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvandoMover(false);
    }
  }

  function processarSoltarNaColuna(
    u: { id: number; nome: string },
    e: DragEvent,
  ) {
    e.preventDefault();
    setColunaDropHoverId(null);
    let payload: { id?: number };
    try {
      payload = JSON.parse(e.dataTransfer.getData("application/json")) as { id?: number };
    } catch {
      return;
    }
    const agId = payload.id;
    if (agId == null) return;
    const ag = agendamentos.find((x) => x.id === agId);
    if (!ag) return;
    const rect = (e.currentTarget as HTMLElement).closest(".agenda-cal-column")?.getBoundingClientRect();
    if (!rect) return;
    const duracaoMs =
      new Date(ag.data_hora_fim).getTime() - new Date(ag.data_hora_inicio).getTime();
    const r = instantesPorDropNaColuna(dataDia, e.clientY, rect, duracaoMs);
    if (!r) return;
    const { inicio, fim } = r;
    if (!agendamentoMudouAposDrop(ag, u.id, inicio, fim)) return;
    if (!podeAgendarRetroativo && inicio.getTime() < msRelogioAgora()) {
      setErroModal(MSG_HORARIO_RETROATIVO);
      return;
    }
    setPendenteMover({
      ag,
      novoUsuarioId: u.id,
      novoUsuarioNome: u.nome,
      inicioIso: inicio.toISOString(),
      fimIso: fim.toISOString(),
    });
  }

  function abrirAtalhoMover(ag: AgendamentoDia) {
    setAtalhoMover({
      ag,
      idUsuario: String(ag.id_usuario),
      horaInicio: formatHoraLocal(new Date(ag.data_hora_inicio)),
    });
  }

  function abrirAnamnese(ag: AgendamentoDia) {
    setMenuCardAbertoId(null);
    setAnamneseAgModal(ag);
  }

  function confirmarAtalhoMoverForm() {
    if (!atalhoMover) return;
    const { ag, idUsuario, horaInicio } = atalhoMover;
    const idU = Number(idUsuario);
    if (!Number.isFinite(idU) || idU <= 0) return;
    const inicio = inicioNaGradeAgenda(dataDia, horaInicio);
    if (!inicio) {
      setErroModal("Horário inválido.");
      return;
    }
    const duracaoMs =
      new Date(ag.data_hora_fim).getTime() - new Date(ag.data_hora_inicio).getTime();
    const fim = new Date(inicio.getTime() + duracaoMs);
    if (!podeAgendarRetroativo && inicio.getTime() < msRelogioAgora()) {
      setErroModal(MSG_HORARIO_RETROATIVO);
      return;
    }
    if (!agendamentoMudouAposDrop(ag, idU, inicio, fim)) {
      setAtalhoMover(null);
      return;
    }
    const u = usuarios.find((x) => x.id === idU);
    if (!u) return;
    setPendenteMover({
      ag,
      novoUsuarioId: idU,
      novoUsuarioNome: u.nome,
      inicioIso: inicio.toISOString(),
      fimIso: fim.toISOString(),
    });
    setAtalhoMover(null);
  }

  function agFiltradosDia(ymd: string): AgendamentoDia[] {
    return agendamentos
      .filter((a) => toYmd(new Date(a.data_hora_inicio)) === ymd)
      .sort(
        (a, b) =>
          new Date(a.data_hora_inicio).getTime() - new Date(b.data_hora_inicio).getTime(),
      );
  }

  function navSemana(delta: number) {
    const d = new Date(`${dataDia}T12:00:00`);
    d.setDate(d.getDate() + 7 * delta);
    setDataDia(toYmd(d));
  }

  function navMes(delta: number) {
    const d = new Date(`${dataDia}T12:00:00`);
    d.setMonth(d.getMonth() + delta);
    setDataDia(toYmd(d));
  }

  return (
    <div className="agenda-cal-wrap">
      {loadError ? (
        <div className="alert alert-danger" role="alert">
          {loadError}
        </div>
      ) : null}

      <div className="agenda-cal-container">
        <div className="agenda-cal-header">
          <div className="agenda-cal-title-group">
            <h2 className="m-0">Agendamentos</h2>
            <div className="agenda-cal-toolbar d-flex flex-wrap align-items-center gap-2">
              <div className="btn-group btn-group-sm" role="group" aria-label="Visualização">
                <button
                  type="button"
                  className={`btn ${visualizacao === "dia" ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => setVisualizacao("dia")}
                >
                  Dia
                </button>
                <button
                  type="button"
                  className={`btn ${visualizacao === "semana" ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => setVisualizacao("semana")}
                >
                  Semana
                </button>
                <button
                  type="button"
                  className={`btn ${visualizacao === "mes" ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => setVisualizacao("mes")}
                >
                  Mês
                </button>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={loading}
                aria-label="Atualizar atendimentos da agenda"
                title="Recarregar atendimentos"
                onClick={() => void loadAgenda()}
              >
                <i
                  className={`fas fa-sync-alt mr-1${loading ? " fa-spin" : ""}`}
                  aria-hidden
                />
                Atualizar
              </button>
              {visualizacao === "dia" ? (
                <div className="agenda-cal-date-field d-flex align-items-center gap-2">
                  <label className="mb-0 small text-muted" htmlFor="agenda-data-input">
                    Data
                  </label>
                  <input
                    id="agenda-data-input"
                    type="date"
                    className="form-control form-control-sm"
                    style={{ width: 168 }}
                    value={dataDia}
                    onChange={(e) => setDataDia(e.target.value)}
                  />
                </div>
              ) : null}
              {visualizacao === "semana" ? (
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    aria-label="Semana anterior"
                    onClick={() => navSemana(-1)}
                  >
                    ◀
                  </button>
                  <span className="small font-weight-bold text-nowrap">
                    {rotuloSemanaPt(limitesSem.inicio, limitesSem.fim)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    aria-label="Próxima semana"
                    onClick={() => navSemana(1)}
                  >
                    ▶
                  </button>
                  <label className="mb-0 small text-muted" htmlFor="agenda-data-semana">
                    Ir para
                  </label>
                  <input
                    id="agenda-data-semana"
                    type="date"
                    className="form-control form-control-sm"
                    style={{ width: 168 }}
                    value={dataDia}
                    onChange={(e) => setDataDia(e.target.value)}
                    title="Qualquer dia na semana desejada"
                  />
                </div>
              ) : null}
              {visualizacao === "mes" ? (
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    aria-label="Mês anterior"
                    onClick={() => navMes(-1)}
                  >
                    ◀
                  </button>
                  <span className="small font-weight-bold text-capitalize text-nowrap">
                    {rotuloMesPt(dataDia)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    aria-label="Próximo mês"
                    onClick={() => navMes(1)}
                  >
                    ▶
                  </button>
                  <input
                    type="month"
                    className="form-control form-control-sm"
                    style={{ width: 168 }}
                    value={dataDia.slice(0, 7)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) setDataDia(`${v}-01`);
                    }}
                    title="Selecionar mês"
                  />
                </div>
              ) : null}
            </div>
          </div>
          {!somenteMenuInicio ? (
            <div className="agenda-cal-actions">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setModalParametrizacaoOpen(true)}
              >
                Parametrização
              </button>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={() => router.push("/pacientes/cadastro?novo=1")}
              >
                <i className="fas fa-user-plus mr-1" aria-hidden /> Novo paciente
              </button>
              <button
                type="button"
                className="agenda-btn-add"
                disabled={loading || usuarios.length === 0}
                onClick={() => void abrirNovo()}
              >
                {loading ? "Carregando…" : "Agendar +"}
              </button>
            </div>
          ) : null}
        </div>

        {usuarios.length === 0 && !loading ? (
          <div className="p-4 text-center text-muted">
            Nenhum profissional disponível para a agenda. Cadastre usuários no grupo Podólogo ou
            configure os grupos acima e associe usuários a esses grupos.
          </div>
        ) : (
          <div className="agenda-cal-scroll border-top">
            {visualizacao === "dia" ? (
              <>
                <div className="d-flex flex-nowrap border-bottom" style={{ background: "#f8fafc" }}>
              <div
                style={{ width: 72 }}
                className="text-center py-2 font-weight-bold small flex-shrink-0"
              >
                Hora
              </div>
              {usuarios.map((u) => (
                <div
                  key={u.id}
                  className="flex-fill text-center py-2 font-weight-bold small border-left"
                  style={{ minWidth: 120 }}
                >
                  {u.nome}
                </div>
              ))}
            </div>
            <div className="d-flex flex-nowrap" style={{ minHeight: alturaColunaPx }}>
              <div className="flex-shrink-0 border-right" style={{ width: 72 }}>
                {linhasVisiveis.map((linha) => (
                  <div
                    key={linha.totalMinutos}
                    style={{ height: alturaLinhaPx }}
                    className="text-center pt-1 small text-muted border-bottom"
                  >
                    {linha.label}
                  </div>
                ))}
              </div>
              {usuarios.map((u) => (
                <div
                  key={u.id}
                  className={`flex-fill position-relative border-left agenda-cal-column ${
                    colunaDropHoverId === u.id ? "agenda-cal-column--drop-hover" : ""
                  }`}
                  style={{
                    minWidth: 120,
                    height: alturaColunaPx,
                    backgroundImage: `repeating-linear-gradient(to bottom, #fff 0, #fff ${alturaLinhaPx - 1}px, #e2e8f0 ${alturaLinhaPx}px)`,
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setColunaDropHoverId(u.id);
                  }}
                  onDragLeave={(e) => {
                    const el = e.currentTarget;
                    const rel = e.relatedTarget as Node | null;
                    if (rel && el.contains(rel)) return;
                    setColunaDropHoverId((cur) => (cur === u.id ? null : cur));
                  }}
                  onDrop={(e) => processarSoltarNaColuna(u, e)}
                >
                  {!somenteMenuInicio ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary position-absolute"
                      style={{ right: 6, top: 6, zIndex: 3, padding: "0 6px", lineHeight: 1.2 }}
                      title="Novo agendamento nesta coluna"
                      onClick={() => void abrirNovo(u.id)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setColunaDropHoverId(u.id);
                      }}
                      onDrop={(e) => processarSoltarNaColuna(u, e)}
                    >
                      +
                    </button>
                  ) : null}
                  <div
                    className="position-absolute w-100"
                    style={{
                      top: 0,
                      left: 0,
                      height: "100%",
                      pointerEvents: "none",
                      zIndex: 2,
                    }}
                  >
                    {agendamentos
                      .filter((a) => a.id_usuario === u.id)
                      .map((a) => {
                        const st = estiloEvento(a.data_hora_inicio, a.data_hora_fim);
                        const statusInfo = iconeStatusAgendamento(a.status);
                        const alturaPct = Number.parseFloat(st.height);
                        const densidade = densidadeCardPorAlturaPercent(
                          Number.isFinite(alturaPct) ? alturaPct : 11,
                        );
                        return (
                          <div
                            key={a.id}
                            role="button"
                            tabIndex={0}
                            draggable={!ocultarSecaoPagamentosAgenda}
                            title={
                              ocultarSecaoPagamentosAgenda
                                ? `${a.paciente_nome} — ${rotuloStatusAgendamento(a.status)}`
                                : `${a.paciente_nome} — ${a.status} — arraste para outro horário ou profissional, ou use o menu ⋮`
                            }
                            className={`agenda-appointment agenda-appointment--${densidade} ${
                              menuCardAbertoId === a.id ? "agenda-appointment--menu-open" : ""
                            } text-left ${classeStatus(a.status)}`}
                            style={{
                              top: st.top,
                              height: st.height,
                              pointerEvents: "auto",
                              ["--card-destaque" as string]: corCardUsuario[a.id_usuario] ?? undefined,
                            }}
                            onDragStart={(ev) => {
                              ev.dataTransfer.setData(
                                "application/json",
                                JSON.stringify({ id: a.id }),
                              );
                              ev.dataTransfer.effectAllowed = "move";
                              dragAgRef.current = { id: a.id, moveu: false };
                            }}
                            onDrag={() => {
                              dragAgRef.current.moveu = true;
                            }}
                            onDragEnd={() => {
                              setColunaDropHoverId(null);
                            }}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter" || ev.key === " ") {
                                ev.preventDefault();
                                if (
                                  dragAgRef.current.id === a.id &&
                                  dragAgRef.current.moveu
                                ) {
                                  return;
                                }
                                void aoClicarCalendarioAgendamento(a);
                              }
                            }}
                            onClick={() => {
                              if (
                                dragAgRef.current.id === a.id &&
                                dragAgRef.current.moveu
                              ) {
                                dragAgRef.current = { id: null, moveu: false };
                                return;
                              }
                              dragAgRef.current = { id: null, moveu: false };
                              void aoClicarCalendarioAgendamento(a);
                            }}
                          >
                            <div
                              className="agenda-appointment-menu-wrap"
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              {(!ocultarSecaoPagamentosAgenda || somenteMenuInicio) &&
                              densidade !== "compact" ? (
                                <button
                                  type="button"
                                  className="agenda-appointment-kebab"
                                  title="Opções (mover sem arrastar)"
                                  aria-haspopup="true"
                                  aria-expanded={menuCardAbertoId === a.id}
                                  aria-label="Opções do agendamento"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setMenuCardAbertoId((id) => (id === a.id ? null : a.id));
                                  }}
                                >
                                  ⋮
                                </button>
                              ) : null}
                              {menuCardAbertoId === a.id &&
                              (!ocultarSecaoPagamentosAgenda || somenteMenuInicio) &&
                              densidade !== "compact" ? (
                                <ul className="agenda-appointment-menu" role="menu">
                                  {!ocultarSecaoPagamentosAgenda ? (
                                    <>
                                      <li role="none">
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="dropdown-item"
                                          onClick={() => {
                                            setMenuCardAbertoId(null);
                                            void aoClicarCalendarioAgendamento(a);
                                          }}
                                        >
                                          Editar
                                        </button>
                                      </li>
                                      <li role="none">
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="dropdown-item"
                                          onClick={() => {
                                            setMenuCardAbertoId(null);
                                            abrirAtalhoMover(a);
                                          }}
                                        >
                                          Mover horário e responsável…
                                        </button>
                                      </li>
                                    </>
                                  ) : null}
                                  {perfilAdminAgenda &&
                                  (a.status === "pendente" || a.status === "confirmado") ? (
                                    <li role="none">
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="dropdown-item"
                                        disabled={salvandoStatusMenuAgId === a.id}
                                        onClick={() => void colocarEmAndamentoDesdeMenu(a)}
                                      >
                                        {salvandoStatusMenuAgId === a.id
                                          ? "Salvando…"
                                          : "Colocar em andamento"}
                                      </button>
                                    </li>
                                  ) : null}
                                  {perfilAdminAgenda && a.status === "em_andamento" ? (
                                    <li role="none">
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="dropdown-item"
                                        onClick={() => abrirProntuarioFinalizarDesdeMenu(a)}
                                      >
                                        Finalizar
                                      </button>
                                    </li>
                                  ) : null}
                                  <li role="none">
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="dropdown-item"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        setMenuCardAbertoId(null);
                                        void abrirAnamnese(a);
                                      }}
                                      onMouseDown={(ev) => ev.stopPropagation()}
                                    >
                                      Anamnese
                                    </button>
                                  </li>
                                </ul>
                              ) : null}
                            </div>
                            <strong className="d-block text-truncate pr-4" title={a.paciente_nome}>
                              {densidade !== "compact" ? (
                                <span
                                  className={`agenda-status-badge ${statusInfo.badgeClass}`}
                                  title={`Status: ${statusInfo.label}`}
                                >
                                  <i className={statusInfo.iconClass} aria-hidden />
                                </span>
                              ) : null}{" "}
                              {a.paciente_nome}
                            </strong>
                            <span className="agenda-appointment-time d-block text-truncate">
                              {formatHoraLocal(new Date(a.data_hora_inicio))} às{" "}
                              {formatHoraLocal(new Date(a.data_hora_fim))}
                            </span>
                            <span className="agenda-appointment-room-tag d-inline-block text-truncate">
                              {a.nome_sala}
                            </span>
                            {somenteMenuInicio ? (
                              <div className="mt-1">
                                <button
                                  type="button"
                                  className="btn btn-link btn-sm p-0"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    void abrirAnamnese(a);
                                  }}
                                  onMouseDown={(ev) => ev.stopPropagation()}
                                >
                                  Anamnese
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
              </>
            ) : null}
            {visualizacao === "semana" ? (
              <div className="agenda-cal-vista-semana">
                <div
                  className="d-flex flex-nowrap border-bottom"
                  style={{ background: "#f8fafc" }}
                >
                  <div
                    style={{ width: 56 }}
                    className="text-center py-2 font-weight-bold small flex-shrink-0"
                  >
                    Hora
                  </div>
                  {diasSemanaYmd.map((ymd, idx) => (
                    <div
                      key={ymd}
                      className="flex-fill text-center py-2 border-left small"
                      style={{ minWidth: 100 }}
                    >
                      <div className="font-weight-bold">{nomeDiaSemanaCurto(idx)}</div>
                      <div className="text-muted">
                        {new Date(`${ymd}T12:00:00`).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </div>
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 mt-1"
                        onClick={() => {
                          setDataDia(ymd);
                          setVisualizacao("dia");
                        }}
                      >
                        Ver dia
                      </button>
                    </div>
                  ))}
                </div>
                <div className="d-flex flex-nowrap">
                  <div className="flex-shrink-0 border-right" style={{ width: 56 }}>
                    {linhasVisiveis.map((linha) => (
                      <div
                        key={linha.totalMinutos}
                        style={{ height: alturaLinhaPx }}
                        className="text-center pt-1 small text-muted border-bottom"
                      >
                        {linha.label}
                      </div>
                    ))}
                  </div>
                  {diasSemanaYmd.map((ymd) => (
                    <div
                      key={ymd}
                      className="flex-fill position-relative border-left agenda-cal-week-col"
                      style={{
                        minWidth: 100,
                        height: alturaColunaPx,
                        backgroundImage: `repeating-linear-gradient(to bottom, #fff 0, #fff ${alturaLinhaPx - 1}px, #e2e8f0 ${alturaLinhaPx}px)`,
                      }}
                    >
                      {agFiltradosDia(ymd).map((a) => {
                        const st = estiloEvento(a.data_hora_inicio, a.data_hora_fim);
                        const statusInfo = iconeStatusAgendamento(a.status);
                        const alturaPct = Number.parseFloat(st.height);
                        const densidade = densidadeCardPorAlturaPercent(
                          Number.isFinite(alturaPct) ? alturaPct : 11,
                        );
                        return (
                          <div
                            key={a.id}
                            role="button"
                            tabIndex={0}
                            className={`agenda-appointment agenda-appointment--compact agenda-appointment--${densidade} text-left ${classeStatus(a.status)}`}
                            style={{
                              top: st.top,
                              height: st.height,
                              left: 2,
                              right: 4,
                              ["--card-destaque" as string]: corCardUsuario[a.id_usuario] ?? undefined,
                            }}
                            title={a.paciente_nome}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter" || ev.key === " ") {
                                ev.preventDefault();
                                void aoClicarCalendarioAgendamento(a);
                              }
                            }}
                            onClick={() => void aoClicarCalendarioAgendamento(a)}
                          >
                            <span className="d-block text-truncate small font-weight-bold">
                              {densidade !== "compact" ? (
                                <span
                                  className={`agenda-status-badge ${statusInfo.badgeClass}`}
                                  title={`Status: ${statusInfo.label}`}
                                >
                                  <i className={statusInfo.iconClass} aria-hidden />
                                </span>
                              ) : null}{" "}
                              {a.paciente_nome}
                            </span>
                            <span className="agenda-appointment-time d-block text-truncate">
                              {formatHoraLocal(new Date(a.data_hora_inicio))} às{" "}
                              {formatHoraLocal(new Date(a.data_hora_fim))}
                            </span>
                            <span className="agenda-appointment-room-tag d-inline-block text-truncate">
                              {a.nome_sala}
                            </span>
                            {somenteMenuInicio ? (
                              <span className="d-block mt-1">
                                <button
                                  type="button"
                                  className="btn btn-link btn-sm p-0"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    void abrirAnamnese(a);
                                  }}
                                  onMouseDown={(ev) => ev.stopPropagation()}
                                >
                                  Anamnese
                                </button>
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {visualizacao === "mes" ? (
              <div className="agenda-cal-vista-mes p-2">
                <div
                  className="agenda-cal-month-weekdays d-grid mb-1"
                  style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
                >
                  {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                    <div
                      key={d}
                      className="text-center small font-weight-bold text-muted py-1 border-bottom"
                    >
                      {d}
                    </div>
                  ))}
                </div>
                {gradeMes.map((row, ri) => (
                  <div
                    key={ri}
                    className="d-grid agenda-cal-month-row border-left border-top"
                    style={{ gridTemplateColumns: "repeat(7, 1fr)", minHeight: 96 }}
                  >
                    {row.map((cell, ci) => {
                      const list = cell ? agFiltradosDia(cell.ymd) : [];
                      return (
                        <div
                          key={ci}
                          className={`agenda-cal-month-cell border-right border-bottom p-1 ${
                            cell ? "" : "agenda-cal-month-cell--empty bg-light"
                          }`}
                        >
                          {cell ? (
                            <>
                              <div className="d-flex justify-content-between align-items-start mb-1">
                                <button
                                  type="button"
                                  className="btn btn-link btn-sm p-0 font-weight-bold"
                                  onClick={() => {
                                    setDataDia(cell.ymd);
                                    setVisualizacao("dia");
                                  }}
                                >
                                  {cell.dia}
                                </button>
                              </div>
                              <div className="agenda-cal-month-events">
                                {list.slice(0, 4).map((a) => {
                                  const statusInfo = iconeStatusAgendamento(a.status);
                                  const densidade: DensidadeCardAgenda = "compact";
                                  return (
                                  <div
                                    key={a.id}
                                    role="button"
                                    tabIndex={0}
                                    className={`agenda-cal-month-chip agenda-cal-month-chip--${densidade} w-100 text-left ${classeStatus(a.status)}`}
                                    style={{
                                      ["--card-destaque" as string]:
                                        corCardUsuario[a.id_usuario] ?? undefined,
                                    }}
                                    onKeyDown={(ev) => {
                                      if (ev.key === "Enter" || ev.key === " ") {
                                        ev.preventDefault();
                                        void aoClicarCalendarioAgendamento(a);
                                      }
                                    }}
                                    onClick={() => void aoClicarCalendarioAgendamento(a)}
                                  >
                                    <span className="d-block text-truncate small font-weight-bold">
                                      {densidade !== "compact" ? (
                                        <span
                                          className={`agenda-status-badge ${statusInfo.badgeClass}`}
                                          title={`Status: ${statusInfo.label}`}
                                        >
                                          <i className={statusInfo.iconClass} aria-hidden />
                                        </span>
                                      ) : null}{" "}
                                      {a.paciente_nome}
                                    </span>
                                    <span className="agenda-cal-month-chip-time d-block text-truncate">
                                      {formatHoraLocal(new Date(a.data_hora_inicio))} às{" "}
                                      {formatHoraLocal(new Date(a.data_hora_fim))}
                                    </span>
                                    <span className="agenda-cal-month-chip-room d-inline-block text-truncate">
                                      {a.nome_sala}
                                    </span>
                                    {somenteMenuInicio ? (
                                      <span className="d-block mt-1">
                                        <button
                                          type="button"
                                          className="btn btn-link btn-sm p-0"
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            void abrirAnamnese(a);
                                          }}
                                          onMouseDown={(ev) => ev.stopPropagation()}
                                        >
                                          Anamnese
                                        </button>
                                      </span>
                                    ) : null}
                                  </div>
                                  );
                                })}
                                {list.length > 4 ? (
                                  <div className="small text-muted pl-1">
                                    +{list.length - 4} outros
                                  </div>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {modalParametrizacaoOpen ? (
        <ModalBackdrop
          onBackdropClick={() => {
            if (!salvandoGrupos) setModalParametrizacaoOpen(false);
          }}
        >
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id={modalParametrizacaoTitleId}>
                  Parametrização
                </h5>
                <button
                  type="button"
                  className="close"
                  disabled={salvandoGrupos}
                  onClick={() => setModalParametrizacaoOpen(false)}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="font-weight-bold mb-2">Grupos exibidos na agenda</p>
                <p className="text-muted small mb-3">
                  Selecione quais grupos de usuário aparecem como colunas. Se nenhum estiver
                  salvo, o sistema usa o grupo cujo nome contém &quot;podolog&quot; (ex.:
                  Podólogo).
                  {agendaGruposConfigurados ? (
                    <span className="d-block mt-2">Configuração ativa para esta empresa.</span>
                  ) : (
                    <span className="d-block mt-2">Usando fallback automático (Podólogo).</span>
                  )}
                </p>
                <div className="d-flex flex-wrap gap-3">
                  {gruposTodos.map((g) => (
                    <div key={g.id} className="custom-control custom-checkbox">
                      <input
                        type="checkbox"
                        className="custom-control-input"
                        id={`agenda-grupo-modal-${g.id}`}
                        checked={gruposSelecionados.has(g.id)}
                        onChange={() => toggleGrupo(g.id)}
                      />
                      <label
                        className="custom-control-label"
                        htmlFor={`agenda-grupo-modal-${g.id}`}
                      >
                        {g.grupo_usuarios}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={salvandoGrupos}
                  onClick={() => setModalParametrizacaoOpen(false)}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={salvandoGrupos}
                  onClick={() => void salvarGruposAgenda()}
                >
                  {salvandoGrupos ? "Salvando..." : "Salvar grupos"}
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {erroModal ? (
        <ModalBackdrop zIndex={1080} onBackdropClick={() => setErroModal(null)}>
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Não foi possível salvar</h5>
                <button
                  type="button"
                  className="close"
                  onClick={() => setErroModal(null)}
                  aria-label="Fechar"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="mb-0">{erroModal}</p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setErroModal(null)}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {pendenteMover ? (
        <ModalBackdrop
          zIndex={1090}
          onBackdropClick={() => {
            if (!salvandoMover) setPendenteMover(null);
          }}
        >
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirmar alteração</h5>
                <button
                  type="button"
                  className="close"
                  disabled={salvandoMover}
                  onClick={() => setPendenteMover(null)}
                  aria-label="Fechar"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="mb-2">
                  Mover o agendamento de <strong>{pendenteMover.ag.paciente_nome}</strong>?
                </p>
                <ul className="mb-0 pl-3 small">
                  <li>
                    Responsável: <strong>{pendenteMover.novoUsuarioNome}</strong>
                  </li>
                  <li>
                    Início: <strong>{fmtDataHoraPt(new Date(pendenteMover.inicioIso))}</strong>
                  </li>
                  <li>
                    Fim: <strong>{fmtDataHoraPt(new Date(pendenteMover.fimIso))}</strong>
                  </li>
                </ul>
                <p className="text-muted small mt-2 mb-0">
                  A alteração só será salva se não houver conflito com outro horário do mesmo
                  responsável e se o início não for retroativo.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={salvandoMover}
                  onClick={() => setPendenteMover(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={salvandoMover}
                  onClick={() => void aplicarMoverAgendamento()}
                >
                  {salvandoMover ? "Salvando…" : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {anamneseAgModal ? (
        <ModalAnamneseAgenda
          key={`anamnese-${anamneseAgModal.id}`}
          ag={{
            id: anamneseAgModal.id,
            id_paciente: anamneseAgModal.id_paciente,
            paciente_nome: anamneseAgModal.paciente_nome,
          }}
          onClose={() => setAnamneseAgModal(null)}
          onSalvo={() => {
            router.refresh();
            void loadAgenda();
          }}
        />
      ) : null}

      {atalhoMover ? (
        <ModalBackdrop zIndex={1075} onBackdropClick={() => setAtalhoMover(null)}>
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id={modalAtalhoMoverTitleId}>
                  Mover agendamento
                </h5>
                <button
                  type="button"
                  className="close"
                  onClick={() => setAtalhoMover(null)}
                  aria-label="Fechar"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="mb-2">
                  <strong>{atalhoMover.ag.paciente_nome}</strong>
                </p>
                <p className="text-muted small mb-3">
                  Dia{" "}
                  <strong>
                    {new Date(`${dataDia}T12:00:00`).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </strong>
                  {" · "}
                  Duração mantida:{" "}
                  <strong>
                    {Math.max(
                      1,
                      Math.round(
                        (new Date(atalhoMover.ag.data_hora_fim).getTime() -
                          new Date(atalhoMover.ag.data_hora_inicio).getTime()) /
                          60_000,
                      ),
                    )}{" "}
                    min
                  </strong>
                </p>
                <div className="form-group">
                  <label htmlFor="agenda-atalho-usuario">Responsável</label>
                  <select
                    id="agenda-atalho-usuario"
                    className="form-control"
                    value={atalhoMover.idUsuario}
                    onChange={(e) =>
                      setAtalhoMover((p) =>
                        p ? { ...p, idUsuario: e.target.value } : null,
                      )
                    }
                  >
                    {usuarios.map((x) => (
                      <option key={x.id} value={String(x.id)}>
                        {x.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group mb-0">
                  <label htmlFor="agenda-atalho-hora">Hora de início</label>
                  <input
                    id="agenda-atalho-hora"
                    type="time"
                    className="form-control"
                    step={900}
                    value={atalhoMover.horaInicio}
                    onChange={(e) =>
                      setAtalhoMover((p) =>
                        p ? { ...p, horaInicio: e.target.value } : null,
                      )
                    }
                  />
                  <small className="form-text text-muted">
                    Entre 8h e 20h; ao confirmar, o horário é ajustado ao encaixe de 15 minutos.
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setAtalhoMover(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => confirmarAtalhoMoverForm()}
                >
                  Continuar para confirmação
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {modalAtendimentoPodologo &&
      modalAtendimentoPodologo.status === "em_andamento" ? (
        <ModalProntuarioPodologo
          ag={modalAtendimentoPodologo}
          onClose={() => {
            setModalAtendimentoPodologo(null);
            setFinalizarAposProntuarioId(null);
          }}
          onSalvo={() => {
            const alvo = modalAtendimentoPodologo;
            setModalAtendimentoPodologo(null);
            if (alvo && finalizarAposProntuarioId === alvo.id) {
              setFinalizarAposProntuarioId(null);
              void (async () => {
                try {
                  const res = await fetch(`/api/agendamentos/${alvo.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "realizado" }),
                  });
                  const j = (await res.json()) as RespostaErroApiAgendamento;
                  if (!res.ok) {
                    logRespostaErroApiAgendamento(
                      "PATCH finalizar após prontuário (agenda)",
                      res,
                      j,
                      { status: "realizado" },
                    );
                    setErroModal(j.error ?? "Erro ao finalizar atendimento.");
                    return;
                  }
                  router.refresh();
                  void loadAgenda();
                } catch (e) {
                  setErroModal(
                    e instanceof Error ? e.message : "Erro ao finalizar atendimento.",
                  );
                }
              })();
              return;
            }
            setFinalizarAposProntuarioId(null);
            router.refresh();
            void loadAgenda();
          }}
        />
      ) : modalAtendimentoPodologo ? (
        <ModalBackdrop
          zIndex={1072}
          onBackdropClick={() => {
            if (!iniciandoAtendimentoPodologo) {
              setModalAtendimentoPodologo(null);
              setFinalizarAposProntuarioId(null);
            }
          }}
        >
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id={modalPodologoAtendimentoTitleId}>
                  Atendimento
                </h5>
                <button
                  type="button"
                  className="close"
                  disabled={iniciandoAtendimentoPodologo}
                  onClick={() => {
                    setModalAtendimentoPodologo(null);
                    setFinalizarAposProntuarioId(null);
                  }}
                  aria-label="Fechar"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="mb-2">
                  <strong>{modalAtendimentoPodologo.paciente_nome}</strong>
                </p>
                <ul className="mb-0 pl-3 small text-muted">
                  <li>
                    Início:{" "}
                    <strong>
                      {fmtDataHoraPt(new Date(modalAtendimentoPodologo.data_hora_inicio))}
                    </strong>
                  </li>
                  <li>
                    Término:{" "}
                    <strong>
                      {fmtDataHoraPt(new Date(modalAtendimentoPodologo.data_hora_fim))}
                    </strong>
                  </li>
                  <li>
                    Sala: <strong>{modalAtendimentoPodologo.nome_sala}</strong>
                  </li>
                  <li>
                    Status:{" "}
                    <strong>{rotuloStatusAgendamento(modalAtendimentoPodologo.status)}</strong>
                  </li>
                </ul>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={iniciandoAtendimentoPodologo}
                  onClick={() => {
                    setModalAtendimentoPodologo(null);
                    setFinalizarAposProntuarioId(null);
                  }}
                >
                  Fechar
                </button>
                {modalAtendimentoPodologo.status === "pendente" ||
                modalAtendimentoPodologo.status === "confirmado" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={iniciandoAtendimentoPodologo}
                    onClick={() => void executarIniciarAtendimentoPodologo()}
                  >
                    {iniciandoAtendimentoPodologo ? "Salvando…" : "Iniciar atendimento"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}

      {modalOpen ? (
        <ModalBackdrop onBackdropClick={() => setModalOpen(false)}>
          <div className="modal-dialog modal-lg modal-agenda-form" role="document">
            <div className="modal-content">
              <form onSubmit={(e) => void submit(e)} noValidate>
                <div className="modal-header">
                  <h5 className="modal-title" id={modalId}>
                    {editingId ? "Editar agendamento" : "Novo agendamento"}
                  </h5>
                  <button
                    type="button"
                    className="close"
                    onClick={() => setModalOpen(false)}
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
                <div className="modal-body">
                  {formError ? (
                    <div className="alert alert-danger py-2 small" role="alert">
                      {formError}
                    </div>
                  ) : null}

                  <div className="form-row">
                    <div className="form-group col-md-6">
                      <label>Profissional</label>
                      <select
                        className="form-control"
                        value={idUsuario}
                        onChange={(e) => {
                          const v = e.target.value;
                          setIdUsuario(v);
                          if (perfilAdminAgenda && editingId === null) {
                            setModalProcLinhas([]);
                            setProcAgendaDirty(false);
                          }
                        }}
                        required
                      >
                        <option value="">Selecione...</option>
                        {usuarios.map((x) => (
                          <option key={x.id} value={String(x.id)}>
                            {x.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group col-md-6">
                      <label htmlFor="agenda-paciente-busca">Paciente</label>
                      <div className="agenda-paciente-search-wrap">
                        <input
                          id="agenda-paciente-busca"
                          type="search"
                          className="form-control"
                          placeholder="Nome ou CPF do paciente…"
                          autoComplete="off"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-haspopup="listbox"
                          aria-expanded={pacienteListaAberta}
                          aria-controls="agenda-paciente-listbox"
                          value={pacienteBusca}
                          onChange={(e) => {
                            setPacienteBusca(e.target.value);
                            setIdPaciente("");
                            setPacienteListaAberta(true);
                          }}
                          onFocus={() => setPacienteListaAberta(true)}
                          onBlur={() => {
                            window.setTimeout(() => setPacienteListaAberta(false), 200);
                          }}
                        />
                        {pacienteListaAberta ? (
                          <ul
                            id="agenda-paciente-listbox"
                            className="agenda-paciente-dropdown"
                            role="listbox"
                          >
                            {pacientesFiltrados.length === 0 ? (
                              <li className="agenda-paciente-empty">
                                {pacienteBusca.trim() === ""
                                  ? "Digite o nome ou parte do CPF para buscar entre todos os pacientes."
                                  : "Nenhum paciente encontrado."}
                              </li>
                            ) : (
                              pacientesFiltrados.map((p) => (
                                <li key={p.id} role="presentation">
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={String(p.id) === idPaciente}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => selecionarPaciente(p)}
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
                        <small className="form-text text-muted">
                          Escolha um nome na lista ao buscar.
                        </small>
                      )}
                      <label
                        className="small font-weight-bold text-muted d-block mt-2 mb-1"
                        htmlFor="agenda-paciente-whatsapp-tel"
                      >
                        WhatsApp
                      </label>
                      <div className="input-group input-group-sm">
                        <div className="input-group-prepend">
                          {pacienteSelecionado && urlWhatsPacienteSelecionado ? (
                            <a
                              className="btn btn-success"
                              href={urlWhatsPacienteSelecionado}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Conversar no WhatsApp"
                              aria-label="Abrir WhatsApp do paciente"
                            >
                              <i className="fab fa-whatsapp" aria-hidden />
                            </a>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              disabled
                              title={
                                idPaciente
                                  ? "Cadastre o telefone do paciente em Pacientes"
                                  : "Selecione um paciente"
                              }
                              aria-label="WhatsApp indisponível"
                            >
                              <i className="fab fa-whatsapp text-muted" aria-hidden />
                            </button>
                          )}
                        </div>
                        <input
                          id="agenda-paciente-whatsapp-tel"
                          type="text"
                          className="form-control bg-light"
                          readOnly
                          tabIndex={-1}
                          value={
                            pacienteSelecionado
                              ? formatarTelefoneExibir(pacienteSelecionado.telefone)
                              : ""
                          }
                          placeholder={
                            idPaciente
                              ? "Sem telefone cadastrado"
                              : "Selecione um paciente para ver o número"
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Sala</label>
                    <select
                      className="form-control"
                      value={idSala}
                      onChange={(e) => setIdSala(e.target.value)}
                      required
                    >
                      <option value="">Selecione...</option>
                      {salas.map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  {perfilAdminAgenda ? (
                    <>
                      <hr />
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <strong>Procedimentos</strong>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={addProcLinhaAgenda}
                          disabled={procCatalogoAgenda.length === 0}
                        >
                          + Procedimento
                        </button>
                      </div>
                      {procCatalogoAgenda.length === 0 ? (
                        <p className="small text-muted mb-3">
                          {idUsuario
                            ? "Nenhum procedimento liberado para este profissional."
                            : "Selecione o profissional para listar os procedimentos."}
                        </p>
                      ) : (
                        modalProcLinhas.map((linha, idx) => (
                          <div key={idx} className="form-row align-items-end mb-2">
                            <div className="form-group col-md-7 mb-0">
                              <label className="small">Procedimento</label>
                              <select
                                className="form-control form-control-sm"
                                value={linha.id_procedimento || ""}
                                onChange={(e) => {
                                  const id = Number(e.target.value);
                                  const pr = procCatalogoAgenda.find((p) => p.id === id);
                                  setModalProcLinhas((prev) =>
                                    prev.map((p, i) =>
                                      i === idx
                                        ? {
                                            ...p,
                                            id_procedimento: id,
                                            valor_aplicado:
                                              pr?.valor_total ?? p.valor_aplicado,
                                          }
                                        : p,
                                    ),
                                  );
                                  setProcAgendaDirty(true);
                                }}
                              >
                                {procCatalogoAgenda.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.procedimento}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="form-group col-md-4 mb-0">
                              <label className="small">Valor aplicado</label>
                              <input
                                type="text"
                                readOnly
                                className="form-control form-control-sm bg-light"
                                value={linha.valor_aplicado.toLocaleString("pt-BR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              />
                            </div>
                            <div className="form-group col-md-1 mb-0">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => {
                                  setModalProcLinhas((prev) =>
                                    prev.filter((_, i) => i !== idx),
                                  );
                                  setProcAgendaDirty(true);
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  ) : null}

                  <div className="form-row">
                    <div className="form-group col-md-6">
                      <label>Início</label>
                      <input
                        type="datetime-local"
                        className="form-control"
                        min={!editingId ? toDatetimeLocalValue(instanteMinimoInicio()) : undefined}
                        step={60}
                        value={inicioLocal}
                        onChange={(e) => {
                          const v = e.target.value;
                          setInicioLocal(v);
                          const si = new Date(v);
                          if (!Number.isNaN(si.getTime())) {
                            setHoraFimLocal(formatHoraLocal(adicionarMinutos(si, 30)));
                          }
                        }}
                        required
                      />
                    </div>
                    <div className="form-group col-md-6">
                      <label>Fim (hora)</label>
                      <input
                        type="time"
                        className={`form-control ${erroFimMenorQueInicio ? "is-invalid" : ""}`}
                        value={horaFimLocal}
                        onChange={(e) => setHoraFimLocal(e.target.value)}
                        required
                        title="A data do término é a mesma do início (ajuste o início para mudar o dia)."
                      />
                      {erroFimMenorQueInicio ? (
                        <div className="invalid-feedback d-block">
                          O horário de fim deve ser maior que a data/hora de início.
                        </div>
                      ) : null}
                      <small className="form-text text-muted">
                        A data do término é a mesma do início (altere o início para mudar o dia).
                      </small>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group col-md-4">
                      <label>Status</label>
                      <select
                        className="form-control"
                        value={statusAg}
                        onChange={(e) => setStatusAg(e.target.value)}
                      >
                        <option value="pendente">Pendente</option>
                        <option value="confirmado">Confirmado</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="realizado">Realizado</option>
                        <option value="cancelado">Cancelado</option>
                        <option value="faltou">Faltou</option>
                        <option value="adiado">Adiado</option>
                      </select>
                    </div>
                    <div className="form-group col-md-4">
                      <label>Desconto (%)</label>
                      <input
                        className="form-control bg-light"
                        value={desconto}
                        disabled
                        readOnly
                        title="Desconto fixo em 0% por enquanto."
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Observações</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                    />
                  </div>

                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setModalOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </div>
  );
}
