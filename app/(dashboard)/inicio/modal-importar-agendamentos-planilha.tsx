"use client";

import * as XLSX from "xlsx";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { objetoPlanilhaParaLinhaBruta } from "@/lib/agenda/importacao-planilha-mapa-colunas";
import { MAX_LINHAS_IMPORTACAO_AGENDAMENTOS } from "@/lib/agenda/importacao-planilha-limites";
import { linhaPlanilhaTemProcedimentos } from "@/lib/agenda/importacao-planilha-parse";
import type {
  CatalogosImportacaoResponse,
  LinhaExecutarImport,
  LinhaPlanilhaBruta,
  LinhaPreviewImport,
  ResumoPreviewImportacao,
} from "@/lib/agenda/importacao-planilha-servico";

const STATUS_OPTIONS = [
  "pendente",
  "confirmado",
  "em_andamento",
  "realizado",
  "cancelado",
  "faltou",
  "adiado",
] as const;

function PacienteAssociarSearch({
  nomePlanilha,
  onAssociar,
}: {
  nomePlanilha: string;
  onAssociar: (id: number) => void;
}) {
  const [q, setQ] = useState(() => nomePlanilha.trim());
  const [aberto, setAberto] = useState(false);
  const [filtrados, setFiltrados] = useState<{ id: number; nome: string }[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setFiltrados([]);
      setErroBusca(null);
      setCarregando(false);
      return;
    }
    let cancelado = false;
    const idTimer = window.setTimeout(async () => {
      setCarregando(true);
      setErroBusca(null);
      try {
        const res = await fetch(`/api/pacientes?busca=${encodeURIComponent(t)}`, {
          cache: "no-store",
        });
        const j = (await res.json()) as { data?: unknown; error?: string };
        if (!res.ok) throw new Error(j.error ?? "Erro ao buscar pacientes.");
        const raw = Array.isArray(j.data) ? j.data : [];
        const lista: { id: number; nome: string }[] = [];
        for (const row of raw) {
          if (!row || typeof row !== "object") continue;
          const o = row as Record<string, unknown>;
          const id = Number(o.id);
          const nome = typeof o.nome === "string" ? o.nome : "";
          if (!Number.isFinite(id) || id <= 0) continue;
          lista.push({
            id,
            nome: nome || `Paciente #${id}`,
          });
        }
        if (!cancelado) setFiltrados(lista);
      } catch (e) {
        if (!cancelado) {
          setErroBusca(e instanceof Error ? e.message : "Erro ao buscar.");
          setFiltrados([]);
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }, 380);
    return () => {
      cancelado = true;
      clearTimeout(idTimer);
    };
  }, [q]);

  const podeListar = q.trim().length >= 2;

  return (
    <div className="mt-1">
      <div className="small mb-1">
        <span className="text-muted">Nome na planilha: </span>
        <strong>{nomePlanilha.trim() ? nomePlanilha : "—"}</strong>
      </div>
      <div className="position-relative">
        <input
          type="search"
          className="form-control form-control-sm"
          placeholder="Digite ao menos 2 letras — busca em todo o cadastro"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => {
            window.setTimeout(() => setAberto(false), 180);
          }}
          aria-label="Buscar paciente para associar"
          autoComplete="off"
        />
        {aberto && (
          <div
            className="position-absolute w-100 shadow-sm border rounded mt-1 bg-white p-2 small"
            style={{ zIndex: 1060, maxHeight: 240, overflowY: "auto" }}
            role="listbox"
          >
            {!podeListar ? (
              <span className="text-muted">Digite ao menos 2 caracteres para buscar na base.</span>
            ) : carregando ? (
              <span className="text-muted">
                <i className="fas fa-spinner fa-spin mr-1" aria-hidden />
                Buscando…
              </span>
            ) : erroBusca ? (
              <span className="text-danger">{erroBusca}</span>
            ) : filtrados.length === 0 ? (
              <span className="text-muted">Nenhum paciente encontrado com esse termo.</span>
            ) : (
              <ul className="list-unstyled mb-0">
                {filtrados.map((p) => (
                  <li key={p.id} className="border-bottom py-1">
                    <button
                      type="button"
                      className="btn btn-link btn-sm text-left text-dark p-0"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onAssociar(p.id);
                        setQ("");
                        setAberto(false);
                      }}
                    >
                      {p.nome}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Chamado após importação com sucesso em ao menos uma linha. */
  onImported: () => void;
};

export function ModalImportarAgendamentosPlanilha({ open, onClose, onImported }: Props) {
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [arquivoNome, setArquivoNome] = useState("");
  const [linhasBrutas, setLinhasBrutas] = useState<LinhaPlanilhaBruta[]>([]);
  /** Somente linhas com divergência (para correção manual). */
  const [previewPendentes, setPreviewPendentes] = useState<LinhaPreviewImport[]>([]);
  /** Linhas válidas ocultas na tabela; usadas no POST de importação. */
  const [linhasProntasImport, setLinhasProntasImport] = useState<LinhaPreviewImport[]>([]);
  const [resumoImport, setResumoImport] = useState<ResumoPreviewImportacao | null>(null);
  const [catalogos, setCatalogos] = useState<CatalogosImportacaoResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [avisosLeitura, setAvisosLeitura] = useState<string | null>(null);
  const [ignoradasLeituraCliente, setIgnoradasLeituraCliente] = useState(0);
  const [executando, setExecutando] = useState(false);
  const [progressoImport, setProgressoImport] = useState(0);
  const progressoImportTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [execResumo, setExecResumo] = useState<string | null>(null);
  /** Após importação com sucesso: mensagem destacada até o usuário enviar outro arquivo ou fechar. */
  const [mensagemSucessoImportacao, setMensagemSucessoImportacao] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !executando) return;
    const bloquearEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", bloquearEscape, true);
    return () => document.removeEventListener("keydown", bloquearEscape, true);
  }, [open, executando]);

  const refetchPreview = useCallback(async (linhas: LinhaPlanilhaBruta[]) => {
    setPreviewLoading(true);
    setPreviewErr(null);
    try {
      const res = await fetch("/api/agendamentos/importar/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linhas }),
      });
      const j = (await res.json()) as {
        linhasPendentes?: LinhaPreviewImport[];
        linhasProntas?: LinhaPreviewImport[];
        resumo?: ResumoPreviewImportacao;
        catalogos?: CatalogosImportacaoResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro na pré-visualização.");
      setPreviewPendentes(Array.isArray(j.linhasPendentes) ? j.linhasPendentes : []);
      setLinhasProntasImport(Array.isArray(j.linhasProntas) ? j.linhasProntas : []);
      setResumoImport(j.resumo ?? null);
      setCatalogos(j.catalogos ?? null);
    } catch (e) {
      setPreviewErr(e instanceof Error ? e.message : "Erro ao pré-visualizar.");
      setPreviewPendentes([]);
      setLinhasProntasImport([]);
      setResumoImport(null);
      setCatalogos(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const aoEscolherArquivo = useCallback(
    async (fileList: FileList | null) => {
      setMensagemSucessoImportacao(null);
      setExecResumo(null);
      const f = fileList?.[0];
      if (!f) return;
      setArquivoNome(f.name);
      setPreviewErr(null);
      setAvisosLeitura(null);
      setIgnoradasLeituraCliente(0);
      try {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: "",
          raw: true,
        });
        const brutas: LinhaPlanilhaBruta[] = [];
        let ignoradasSemProc = 0;
        let excelLinha = 2;
        for (const row of rows) {
          const tem = Object.values(row).some((v) => String(v ?? "").trim() !== "");
          if (!tem) {
            excelLinha += 1;
            continue;
          }
          const br = objetoPlanilhaParaLinhaBruta(row, excelLinha);
          if (!linhaPlanilhaTemProcedimentos(br.procedimentos)) {
            ignoradasSemProc += 1;
            excelLinha += 1;
            continue;
          }
          brutas.push(br);
          excelLinha += 1;
        }
        if (ignoradasSemProc > 0) {
          setIgnoradasLeituraCliente(ignoradasSemProc);
          setAvisosLeitura(
            `${ignoradasSemProc} linha(s) da planilha ignorada(s) por não ter procedimento na coluna Procedimento(s).`,
          );
        }
        if (brutas.length === 0) {
          setPreviewErr(
            ignoradasSemProc > 0
              ? "Nenhuma linha com procedimento para importar. Preencha a coluna Procedimento(s) ou verifique o arquivo."
              : "Nenhuma linha de dados encontrada na primeira aba.",
          );
          setLinhasBrutas([]);
          setPreviewPendentes([]);
          setLinhasProntasImport([]);
          setResumoImport(null);
          setCatalogos(null);
          setIgnoradasLeituraCliente(ignoradasSemProc);
          return;
        }
        setLinhasBrutas(brutas);
        await refetchPreview(brutas);
      } catch (e) {
        setPreviewErr(
          e instanceof Error ? e.message : "Não foi possível ler o arquivo Excel.",
        );
        setLinhasBrutas([]);
        setPreviewPendentes([]);
        setLinhasProntasImport([]);
        setResumoImport(null);
        setCatalogos(null);
        setAvisosLeitura(null);
        setIgnoradasLeituraCliente(0);
      }
    },
    [refetchPreview],
  );

  const atualizarBruta = useCallback(
    (numeroLinha: number, patch: Partial<LinhaPlanilhaBruta>) => {
      setLinhasBrutas((prev) => {
        const next = prev.map((r) =>
          r.numeroLinha === numeroLinha ? { ...r, ...patch } : r,
        );
        void refetchPreview(next);
        return next;
      });
    },
    [refetchPreview],
  );

  const fechar = useCallback(() => {
    if (executando) return;
    setArquivoNome("");
    setLinhasBrutas([]);
    setPreviewPendentes([]);
    setLinhasProntasImport([]);
    setResumoImport(null);
    setCatalogos(null);
    setPreviewErr(null);
    setAvisosLeitura(null);
    setIgnoradasLeituraCliente(0);
    setExecResumo(null);
    setMensagemSucessoImportacao(null);
    setProgressoImport(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  }, [onClose, executando]);

  const importarProntas = useCallback(async () => {
    const prontas = linhasProntasImport;
    if (prontas.length === 0) {
      setExecResumo("Nenhuma linha pronta para importar. Corrija as pendências na tabela.");
      return;
    }
    const payload: LinhaExecutarImport[] = prontas.map((p) => ({
      numeroLinha: p.numeroLinha,
      status: p.status as string,
      data_hora_inicio: p.data_hora_inicio as string,
      data_hora_fim: p.data_hora_fim as string,
      id_paciente: p.id_paciente as number,
      id_usuario: p.id_usuario as number,
      id_sala: p.id_sala as number,
      procedimentos: p.procedimentos.map((x) => ({
        id_procedimento: x.id_procedimento as number,
        valor_aplicado: x.valor_aplicado,
      })),
      observacoes: p.observacoes,
      valor_bruto: p.valor_bruto as number,
      valor_total: p.valor_total as number,
    }));

    setExecutando(true);
    setMensagemSucessoImportacao(null);
    setExecResumo(null);
    setProgressoImport(5);
    if (progressoImportTimerRef.current) {
      clearInterval(progressoImportTimerRef.current);
      progressoImportTimerRef.current = null;
    }
    progressoImportTimerRef.current = setInterval(() => {
      setProgressoImport((p) => (p >= 94 ? 94 : p + 2 + Math.floor(Math.random() * 6)));
    }, 380);
    try {
      const res = await fetch("/api/agendamentos/importar/executar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linhas: payload }),
      });
      const j = (await res.json()) as {
        salvou?: boolean;
        resultados?: { numeroLinha: number; ok: boolean; error?: string }[];
        error?: string;
      };
      const resu = Array.isArray(j.resultados) ? j.resultados : [];

      if (res.ok && j.salvou) {
        setProgressoImport(100);
        const ok = resu.filter((r) => r.ok).length;
        const fal = resu.filter((r) => !r.ok);
        if (ok > 0) onImported();
        setExecResumo(null);
        setMensagemSucessoImportacao(
          fal.length === 0
            ? `Foram importados ${ok} agendamento(s) com sucesso. Os dados da planilha foram limpos — você pode enviar outro arquivo.`
            : `Importação concluída com ${ok} agendamento(s) criado(s). Atenção: ${fal.length} retorno(s) com falha na resposta — confira o histórico ou tente novamente. Os campos foram limpos.`,
        );
        setArquivoNome("");
        setLinhasBrutas([]);
        setPreviewPendentes([]);
        setLinhasProntasImport([]);
        setResumoImport(null);
        setCatalogos(null);
        setPreviewErr(null);
        setAvisosLeitura(null);
        setIgnoradasLeituraCliente(0);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else if (res.status === 400 && j.salvou === false) {
        setProgressoImport(0);
        const comErro = resu.filter((r) => !r.ok).length;
        const exemplos = resu
          .filter((r) => !r.ok && r.error && !r.error.startsWith("Esta linha estaria correta"))
          .slice(0, 4)
          .map((r) => `L${r.numeroLinha}: ${r.error}`);
        setExecResumo(
          `${j.error ?? "Nenhum agendamento foi salvo."}` +
            (comErro > 0
              ? ` (${comErro} linha(s) com retorno — confira o número da linha da planilha e as pendências.)`
              : "") +
            (exemplos.length > 0
              ? ` Exemplo(s): ${exemplos.join(" | ")}`
              : ""),
        );
      } else {
        setProgressoImport(0);
        throw new Error(j.error ?? "Erro ao importar.");
      }
      if (!(res.ok && j.salvou)) {
        await refetchPreview(linhasBrutas);
      }
    } catch (e) {
      setProgressoImport(0);
      setExecResumo(e instanceof Error ? e.message : "Erro ao importar.");
      if (linhasBrutas.length > 0) await refetchPreview(linhasBrutas);
    } finally {
      if (progressoImportTimerRef.current) {
        clearInterval(progressoImportTimerRef.current);
        progressoImportTimerRef.current = null;
      }
      setExecutando(false);
      window.setTimeout(() => setProgressoImport(0), 800);
    }
  }, [linhasProntasImport, linhasBrutas, refetchPreview, onImported]);

  if (!open) return null;

  const cat = catalogos;

  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block" }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={executando}
      >
        <div
          className="modal-dialog modal-xl modal-dialog-scrollable"
          role="document"
        >
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id={titleId}>
                Importar agendamentos (Excel)
              </h5>
              <button
                type="button"
                className="close"
                aria-label="Fechar"
                disabled={executando}
                aria-disabled={executando}
                onClick={fechar}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="modal-body">
              <p className="text-muted small">
                A primeira aba da planilha deve ter os cabeçalhos:{" "}
                <strong>
                  Status, Data, Hora Início, Hora Fim, Paciente, Profissional, Sala,
                  Procedimento(s), Observações, Valor, Valor Total
                </strong>
                . Procedimentos múltiplos: separe por barra (/), ponto e vírgula (;), vírgula (,) ou
                quebra de linha.{" "}
                <strong>Status</strong>: na planilha, <em>Atendido</em> vira realizado e{" "}
                <em>Não atendido</em> vira cancelado. <strong>Sala</strong> vazia: usa a sala cadastrada
                como 01 (ex.: nome &quot;01&quot; ou &quot;Sala 01&quot;).{" "}
                <strong>Valor</strong>: com <strong>um</strong> procedimento e vários valores na célula, os
                valores são <strong>somados</strong>. Com vários procedimentos, um valor por procedimento
                (ordem); falta → <strong>0</strong>; um único valor na célula → rateado entre todos.{" "}
                <strong>Valor Total</strong> e <strong>Valor</strong> vazios contam como 0. Linhas{" "}
                <strong>sem procedimento</strong> na coluna Procedimento(s) são ignoradas. A tabela
                abaixo lista <strong>só linhas com divergência</strong> para você associar manualmente;
                linhas já válidas entram direto no total &quot;prontas para importar&quot;. Limite de{" "}
                <strong>{MAX_LINHAS_IMPORTACAO_AGENDAMENTOS.toLocaleString("pt-BR")}</strong> linhas
                por arquivo. Importações muito grandes podem demorar ou atingir limite de tempo do
                servidor. Na importação, <strong>não</strong> bloqueamos o mesmo profissional com
                vários atendimentos no mesmo horário (conforme a planilha). A importação com
                procedimentos exige perfil <strong>Administrador</strong> ou{" "}
                <strong>Administrativo</strong>. Nomes de procedimento ausentes no cadastro são
                criados automaticamente como <strong>inativos</strong> para concluir a importação.
              </p>
              <div className="form-group">
                <label htmlFor="imp-ag-xlsx">Arquivo (.xlsx / .xls)</label>
                <input
                  ref={fileInputRef}
                  id="imp-ag-xlsx"
                  type="file"
                  accept=".xlsx,.xls"
                  className="form-control-file"
                  disabled={executando}
                  onChange={(e) => void aoEscolherArquivo(e.target.files)}
                />
                {arquivoNome ? (
                  <span className="small text-muted ml-2">{arquivoNome}</span>
                ) : null}
              </div>

              {mensagemSucessoImportacao ? (
                <div
                  className="alert alert-success border border-success shadow-sm py-3 px-3 mb-3"
                  role="alert"
                >
                  <div className="d-flex align-items-start">
                    <i className="fas fa-check-circle fa-2x text-success mr-3 mt-1" aria-hidden />
                    <div>
                      <strong className="d-block" style={{ fontSize: "1.05rem" }}>
                        Importação finalizada
                      </strong>
                      <p className="mb-0 mt-2" style={{ fontSize: "0.98rem" }}>
                        {mensagemSucessoImportacao}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {previewLoading ? (
                <div className="mb-3">
                  <p className="text-muted mb-2">
                    <i className="fas fa-spinner fa-spin mr-2" aria-hidden />
                    Analisando planilha…
                  </p>
                  <div className="progress" style={{ height: 10 }}>
                    <div
                      className="progress-bar progress-bar-striped progress-bar-animated bg-info w-100"
                      role="progressbar"
                      aria-valuenow={100}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                </div>
              ) : null}
              {previewErr ? (
                <div className="alert alert-danger" role="alert">
                  {previewErr}
                </div>
              ) : null}
              {avisosLeitura && !previewErr ? (
                <div className="alert alert-secondary" role="status">
                  {avisosLeitura}
                </div>
              ) : null}
              {execResumo ? (
                <div className="alert alert-info" role="status">
                  {execResumo}
                </div>
              ) : null}
              {executando ? (
                <div className="mb-3" role="status" aria-live="polite">
                  <div className="d-flex align-items-center small text-muted mb-2">
                    <i className="fas fa-spinner fa-spin mr-2" aria-hidden />
                    <span>
                      Importando agendamentos… pode levar vários minutos em lotes grandes.
                    </span>
                  </div>
                  <div className="progress" style={{ height: 12 }}>
                    <div
                      className="progress-bar progress-bar-striped progress-bar-animated bg-primary"
                      style={{ width: `${Math.min(100, progressoImport)}%` }}
                      role="progressbar"
                      aria-valuenow={Math.min(100, Math.round(progressoImport))}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                  <div className="small text-muted text-right mt-1">
                    {Math.min(100, Math.round(progressoImport))}%
                  </div>
                </div>
              ) : null}
              {resumoImport && !previewLoading && !previewErr && cat ? (
                <p className="small text-muted mb-2">
                  {ignoradasLeituraCliente > 0 ? (
                    <>
                      Ignoradas ao ler (sem procedimento):{" "}
                      <strong>{ignoradasLeituraCliente}</strong>
                      {" · "}
                    </>
                  ) : null}
                  {resumoImport.ignoradasSemProcedimento > 0 &&
                  resumoImport.ignoradasSemProcedimento !== ignoradasLeituraCliente ? (
                    <>
                      Ignoradas no servidor (sem procedimento):{" "}
                      <strong>{resumoImport.ignoradasSemProcedimento}</strong>
                      {" · "}
                    </>
                  ) : null}
                  Analisadas (com procedimento):{" "}
                  <strong>{resumoImport.analisadasComProcedimento}</strong> · Prontas para importar:{" "}
                  <strong>{resumoImport.prontasParaImportar}</strong> · Com divergência (tabela):{" "}
                  <strong>{resumoImport.comPendencia}</strong>
                </p>
              ) : null}

              {previewPendentes.length === 0 &&
              linhasProntasImport.length > 0 &&
              cat &&
              !previewLoading &&
              !previewErr ? (
                <p className="alert alert-success py-2 small mb-2" role="status">
                  Nenhuma divergência pendente:{" "}
                  <strong>{linhasProntasImport.length}</strong> linha(s) pronta(s). Clique em
                  Importar.
                </p>
              ) : null}

              {previewPendentes.length > 0 && cat ? (
                <div className="table-responsive" style={{ maxHeight: "55vh" }}>
                  <table className="table table-sm table-bordered table-striped">
                    <thead className="thead-light">
                      <tr>
                        <th>Linha (planilha)</th>
                        <th>Divergências / correção</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewPendentes.map((p) => (
                        <tr key={p.numeroLinha}>
                          <td className="text-nowrap align-top">{p.numeroLinha}</td>
                          <td>
                            {p.pendencias.length === 0 ? (
                              <span className="text-muted small">—</span>
                            ) : (
                              <ul className="list-unstyled mb-0 small">
                                {p.pendencias.map((pen, i) => (
                                  <li key={`${pen.campo}-${i}-${pen.indiceProcedimento ?? ""}`}>
                                    <span className="text-danger">{pen.mensagem}</span>
                                    {pen.campo === "paciente" && cat ? (
                                      <PacienteAssociarSearch
                                        key={`pac-${p.numeroLinha}-paciente`}
                                        nomePlanilha={pen.textoPlanilha}
                                        onAssociar={(id) => {
                                          atualizarBruta(p.numeroLinha, {
                                            id_paciente_manual: id,
                                          });
                                        }}
                                      />
                                    ) : null}
                                    {pen.campo === "profissional" && cat ? (
                                      <select
                                        className="form-control form-control-sm mt-1"
                                        value=""
                                        aria-label={`Profissional linha ${p.numeroLinha}`}
                                        onChange={(e) => {
                                          const id = Number(e.target.value);
                                          if (!id) return;
                                          atualizarBruta(p.numeroLinha, {
                                            id_usuario_manual: id,
                                          });
                                          e.target.value = "";
                                        }}
                                      >
                                        <option value="">Associar profissional…</option>
                                        {cat.usuarios.map((x) => (
                                          <option key={x.id} value={x.id}>
                                            {x.nome}
                                          </option>
                                        ))}
                                      </select>
                                    ) : null}
                                    {pen.campo === "sala" && cat ? (
                                      <select
                                        className="form-control form-control-sm mt-1"
                                        value=""
                                        aria-label={`Sala linha ${p.numeroLinha}`}
                                        onChange={(e) => {
                                          const id = Number(e.target.value);
                                          if (!id) return;
                                          atualizarBruta(p.numeroLinha, { id_sala_manual: id });
                                          e.target.value = "";
                                        }}
                                      >
                                        <option value="">Associar sala…</option>
                                        {cat.salas.map((x) => (
                                          <option key={x.id} value={x.id}>
                                            {x.nome}
                                          </option>
                                        ))}
                                      </select>
                                    ) : null}
                                    {pen.campo === "procedimento" &&
                                    cat &&
                                    pen.indiceProcedimento != null ? (
                                      <select
                                        className="form-control form-control-sm mt-1"
                                        value=""
                                        aria-label={`Procedimento linha ${p.numeroLinha} índice ${pen.indiceProcedimento}`}
                                        onChange={(e) => {
                                          const id = Number(e.target.value);
                                          if (!id) return;
                                          setLinhasBrutas((prev) => {
                                            const br = prev.find(
                                              (b) => b.numeroLinha === p.numeroLinha,
                                            );
                                            const prevM = {
                                              ...(br?.procedimento_id_por_indice ?? {}),
                                            };
                                            prevM[String(pen.indiceProcedimento)] = id;
                                            const next = prev.map((r) =>
                                              r.numeroLinha === p.numeroLinha
                                                ? {
                                                    ...r,
                                                    procedimento_id_por_indice: prevM,
                                                  }
                                                : r,
                                            );
                                            void refetchPreview(next);
                                            return next;
                                          });
                                          e.target.value = "";
                                        }}
                                      >
                                        <option value="">
                                          Associar &quot;{pen.textoPlanilha}&quot;…
                                        </option>
                                        {cat.procedimentos.map((x) => (
                                          <option key={x.id} value={x.id}>
                                            {x.nome}
                                          </option>
                                        ))}
                                      </select>
                                    ) : null}
                                    {pen.campo === "status" ? (
                                      <select
                                        className="form-control form-control-sm mt-1"
                                        value=""
                                        aria-label={`Status linha ${p.numeroLinha}`}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          if (!v) return;
                                          atualizarBruta(p.numeroLinha, { status_manual: v });
                                          e.target.value = "";
                                        }}
                                      >
                                        <option value="">Associar status…</option>
                                        {STATUS_OPTIONS.map((s) => (
                                          <option key={s} value={s}>
                                            {s.replace(/_/g, " ")}
                                          </option>
                                        ))}
                                      </select>
                                    ) : null}
                                    {(pen.campo === "data_hora_inicio" ||
                                      pen.campo === "data_hora_fim") && (
                                      <div className="mt-1 d-flex flex-wrap gap-1 align-items-center">
                                        <input
                                          type="datetime-local"
                                          className="form-control form-control-sm"
                                          style={{ width: 200 }}
                                          aria-label={`${pen.campo} linha ${p.numeroLinha}`}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            if (!v) return;
                                            if (pen.campo === "data_hora_inicio") {
                                              atualizarBruta(p.numeroLinha, {
                                                data_hora_inicio_manual: new Date(v).toISOString(),
                                              });
                                            } else {
                                              atualizarBruta(p.numeroLinha, {
                                                data_hora_fim_manual: new Date(v).toISOString(),
                                              });
                                            }
                                          }}
                                        />
                                        <span className="text-muted">Ajuste manual</span>
                                      </div>
                                    )}
                                    {(pen.campo === "valor" || pen.campo === "valor_total") && (
                                      <input
                                        type="text"
                                        className="form-control form-control-sm mt-1"
                                        placeholder={pen.campo === "valor" ? "Valor bruto" : "Valor total"}
                                        aria-label={`${pen.campo} linha ${p.numeroLinha}`}
                                        onBlur={(e) => {
                                          const v = e.target.value.trim();
                                          if (!v) return;
                                          if (pen.campo === "valor") {
                                            atualizarBruta(p.numeroLinha, { valor: v });
                                          } else {
                                            atualizarBruta(p.numeroLinha, { valorTotal: v });
                                          }
                                        }}
                                      />
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={executando}
                onClick={fechar}
              >
                Fechar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  executando ||
                  previewLoading ||
                  linhasProntasImport.length === 0
                }
                onClick={() => void importarProntas()}
              >
                {executando ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-1" aria-hidden />
                    Importando…
                  </>
                ) : (
                  "Importar linhas prontas"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div
        className="modal-backdrop fade show"
        role="presentation"
        onClick={() => {
          if (!executando) fechar();
        }}
      />
    </>
  );
}
