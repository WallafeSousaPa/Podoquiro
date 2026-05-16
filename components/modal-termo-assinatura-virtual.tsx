"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  montarEnderecoPacienteTermo,
  montarRodapeAssinatura,
  formatarCpfExibicao,
  type DadosPacienteTermo,
  type RodapeDataLocal,
} from "@/lib/termo-consentimento/texto-podoquiro";
import { TermoConsentimentoPreview } from "@/components/termo-consentimento-preview";
import {
  gerarPdfTermoAssinatura,
  montarNomeArquivoTermoAssinatura,
} from "@/lib/client/render-termo-assinatura-pdf";
import { nomeExibicaoPaciente, normalizeCpfDigits } from "@/lib/pacientes";

function canvasTemTraco(c: HTMLCanvasElement): boolean {
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i] ?? 255;
    const g = data[i + 1] ?? 255;
    const b = data[i + 2] ?? 255;
    if (r < 240 || g < 240 || b < 240) return true;
  }
  return false;
}

type ApiPacienteTermo = {
  paciente: {
    nome_completo: string | null;
    nome_social: string | null;
    cpf: string | null;
    email: string | null;
    telefone: string | null;
    cep: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
  };
  empresa: { cidade: string | null; nome_fantasia?: string | null };
};

type Props = {
  open: boolean;
  idPaciente: number;
  nomeDisplayPaciente: string;
  onClose: () => void;
  /** Arquivo PDF (termo + assinatura) para enviar na anamnese. */
  onConfirm: (file: File) => void;
};

export function ModalTermoAssinaturaVirtual({
  open,
  idPaciente,
  nomeDisplayPaciente,
  onClose,
  onConfirm,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const desenhando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  /** Dados do termo para pré-visualização (layout HTML) e PDF. */
  const [dadosPdfTermo, setDadosPdfTermo] = useState<{
    dadosP: DadosPacienteTermo;
    rodape: RodapeDataLocal;
  } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nomeArquivoBase, setNomeArquivoBase] = useState("");
  const [gerando, setGerando] = useState(false);
  const [faseGeracao, setFaseGeracao] = useState<"pdf" | "certificado" | null>(null);

  const iniciarCanvas = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const w = Math.min(880, typeof window !== "undefined" ? window.innerWidth - 48 : 880);
    const h = 200;
    c.width = w;
    c.height = h;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoadErr(null);
    setLoading(true);
    setDadosPdfTermo(null);
    void (async () => {
      try {
        const res = await fetch(`/api/pacientes/${idPaciente}`);
        const json = (await res.json()) as { error?: string } & Partial<ApiPacienteTermo>;
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar dados do paciente.");
        const p = json.paciente;
        const emp = json.empresa;
        if (!p) throw new Error("Dados do paciente indisponíveis.");
        const nome =
          nomeExibicaoPaciente({
            nome_completo: p.nome_completo,
            nome_social: p.nome_social,
          }).trim() || nomeDisplayPaciente;
        setNomeArquivoBase(nome);
        const dadosP: DadosPacienteTermo = {
          nomePaciente: nome,
          cpf: formatarCpfExibicao(normalizeCpfDigits(p.cpf ?? "")),
          telefone: p.telefone?.trim() || "não informado",
          email: p.email?.trim() || "não informado",
          endereco: montarEnderecoPacienteTermo(p),
        };
        const rodape = montarRodapeAssinatura(emp?.cidade);
        setDadosPdfTermo({ dadosP, rodape });
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "Erro ao montar termo.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, idPaciente, nomeDisplayPaciente]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => iniciarCanvas(), 0);
    return () => window.clearTimeout(t);
  }, [open, canvasKey, loading, loadErr, iniciarCanvas]);

  function coords(ev: React.PointerEvent<HTMLCanvasElement>) {
    const el = ev.currentTarget;
    const r = el.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function onPointerDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    desenhando.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    const { x, y } = coords(ev);
    ultimo.current = { x, y };
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  }

  function onPointerMove(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current || !ultimo.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = coords(ev);
    ctx.beginPath();
    ctx.moveTo(ultimo.current.x, ultimo.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ultimo.current = { x, y };
  }

  function onPointerUp(ev: React.PointerEvent<HTMLCanvasElement>) {
    desenhando.current = false;
    ultimo.current = null;
    try {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  }

  async function confirmar() {
    const c = canvasRef.current;
    if (!c || !dadosPdfTermo) return;
    if (!canvasTemTraco(c)) {
      setLoadErr("Desenhe sua assinatura no campo indicado.");
      return;
    }
    setGerando(true);
    setLoadErr(null);
    try {
      const { dadosP, rodape } = dadosPdfTermo;
      setFaseGeracao("pdf");
      const blob = await gerarPdfTermoAssinatura(dadosP, rodape, c);
      const nome = montarNomeArquivoTermoAssinatura(nomeArquivoBase || nomeDisplayPaciente);

      setFaseGeracao("certificado");
      const fd = new FormData();
      fd.append("pdf", new File([blob], nome, { type: "application/pdf" }));
      const resCert = await fetch("/api/termo-consentimento/assinar-certificado", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!resCert.ok) {
        let msg = "Não foi possível assinar o termo com o certificado digital da clínica.";
        try {
          const j = (await resCert.json()) as { error?: string };
          if (j.error?.trim()) msg = j.error.trim();
        } catch {
          /* resposta não JSON */
        }
        throw new Error(msg);
      }
      const blobAssinado = await resCert.blob();
      const file = new File([blobAssinado], nome, { type: "application/pdf" });
      onConfirm(file);
      onClose();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Erro ao gerar PDF.");
    } finally {
      setGerando(false);
      setFaseGeracao(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="position-fixed d-flex flex-column"
      style={{
        inset: 0,
        zIndex: 1080,
        backgroundColor: "#f8f9fa",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-termo-assinatura"
    >
      <div
        className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom bg-white shadow-sm"
        style={{ flexShrink: 0 }}
      >
        <h1 id="titulo-termo-assinatura" className="h5 mb-0">
          Termo de consentimento — assinatura virtual
        </h1>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          disabled={gerando}
          onClick={() => onClose()}
        >
          Fechar
        </button>
      </div>

      <div className="flex-grow-1 overflow-auto px-3 py-3">
        {loading ? (
          <p className="text-muted">Carregando dados do paciente…</p>
        ) : loadErr ? (
          <div className="alert alert-danger">{loadErr}</div>
        ) : (
          <>
            <div
              className="bg-white border rounded p-3 mb-3 shadow-sm"
              style={{ maxWidth: 920, margin: "0 auto" }}
            >
              {dadosPdfTermo ? (
                <TermoConsentimentoPreview dados={dadosPdfTermo.dadosP} rodape={dadosPdfTermo.rodape} />
              ) : null}
            </div>

            <div className="bg-white border rounded p-3 shadow-sm" style={{ maxWidth: 920, margin: "0 auto" }}>
              <p className="small text-muted mb-2">
                Assine no campo abaixo com o dedo ou o mouse. Ao confirmar, o termo será assinado
                digitalmente com o certificado A1 cadastrado em Financeiro → Nota fiscal → Parâmetros.
              </p>
              <canvas
                key={canvasKey}
                ref={canvasRef}
                className="border rounded bg-white d-block w-100"
                style={{ maxWidth: 880, height: 200, cursor: "crosshair", touchAction: "none" as const }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              />
              <div className="d-flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={gerando}
                  onClick={() => setCanvasKey((k) => k + 1)}
                >
                  Limpar assinatura
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={gerando || !!loadErr || !dadosPdfTermo}
                  onClick={() => void confirmar()}
                >
                  {gerando
                    ? faseGeracao === "certificado"
                      ? "Assinando com certificado digital…"
                      : "Gerando PDF…"
                    : "Confirmar e anexar à anamnese"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
