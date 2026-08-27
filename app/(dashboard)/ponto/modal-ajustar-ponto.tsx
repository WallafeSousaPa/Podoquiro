"use client";

import type {
  FuncionarioPontoConsulta,
  FuncionarioPontoOpcao,
  MarcacaoPonto,
} from "@/lib/ponto/consultar-registros";
import type { TipoTratamentoPonto } from "@/lib/ponto/tratamentos";
import { type FormEvent, type ReactNode, useId, useMemo, useState } from "react";

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

function fmtHora(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isoParaDatetimeLocal(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(d)
      .replace(" ", "T");
  } catch {
    return "";
  }
}

function datetimeLocalDoDia(ymd: string, hora = "08:00"): string {
  return `${ymd}T${hora}`;
}

const TIPOS: { value: TipoTratamentoPonto; label: string; ajuda: string }[] = [
  {
    value: "CORRECAO_HORARIO",
    label: "Corrigir horário",
    ajuda: "Troca o horário exibido. A batida original permanece no registro.",
  },
  {
    value: "DESCONSIDERACAO",
    label: "Desconsiderar marcação",
    ajuda: "A batida deixa de contar, mas continua visível no histórico.",
  },
  {
    value: "INCLUSAO",
    label: "Incluir marcação",
    ajuda: "Adiciona um horário que não foi batido no leitor.",
  },
];

export type AjustePontoInicial = {
  funcionarioId: number;
  dataYmd: string;
  nsr?: number | null;
  tipo?: TipoTratamentoPonto;
};

export function ModalAjustarPonto({
  funcionarios,
  funcionariosConsulta,
  inicial,
  onClose,
  onSalvo,
}: {
  funcionarios: FuncionarioPontoOpcao[];
  funcionariosConsulta: FuncionarioPontoConsulta[];
  inicial: AjustePontoInicial | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const titleId = useId();
  const ativos = useMemo(
    () => funcionarios.filter((f) => f.ativo || f.id === inicial?.funcionarioId),
    [funcionarios, inicial?.funcionarioId],
  );

  const temMarcacaoOriginal = Boolean(
    inicial?.funcionarioId != null &&
      funcionariosConsulta
        .find((f) => f.funcionario_id === inicial.funcionarioId)
        ?.dias.some((d) => d.marcacoes.some((m) => m.nsr != null)),
  );

  const tipoInicial: TipoTratamentoPonto =
    inicial?.tipo ??
    (inicial?.nsr || temMarcacaoOriginal ? "CORRECAO_HORARIO" : "INCLUSAO");

  const [tipo, setTipo] = useState<TipoTratamentoPonto>(tipoInicial);
  const [funcionarioId, setFuncionarioId] = useState(
    inicial?.funcionarioId ? String(inicial.funcionarioId) : "",
  );
  const [nsr, setNsr] = useState(
    inicial?.nsr != null ? String(inicial.nsr) : "",
  );
  const [dataHora, setDataHora] = useState(() => {
    if (inicial?.nsr != null) {
      const f = funcionariosConsulta.find(
        (x) => x.funcionario_id === inicial.funcionarioId,
      );
      const m = f?.dias
        .flatMap((d) => d.marcacoes)
        .find((x) => x.nsr === inicial.nsr);
      if (m) return isoParaDatetimeLocal(m.data_hora_fato);
    }
    if (inicial?.dataYmd) return datetimeLocalDoDia(inicial.dataYmd);
    return "";
  });
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const marcacoesOriginais = useMemo(() => {
    const fid = Number(funcionarioId);
    const f = funcionariosConsulta.find((x) => x.funcionario_id === fid);
    const lista: MarcacaoPonto[] = f
      ? f.dias.flatMap((d) => d.marcacoes)
      : [];
    const vistos = new Set<string>();
    const unicos: MarcacaoPonto[] = [];
    for (const m of lista) {
      if (m.nsr == null) continue;
      const k = `${m.empregador_id}:${m.nsr}:${m.desconsiderada ? "d" : "e"}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      unicos.push(m);
    }
    return unicos.sort((a, b) => a.data_hora_fato.localeCompare(b.data_hora_fato));
  }, [funcionarioId, funcionariosConsulta]);

  const precisaMarcacao = tipo !== "INCLUSAO";
  const precisaHorario = tipo !== "DESCONSIDERACAO";
  const empresaSelecionada =
    ativos.find((f) => String(f.id) === funcionarioId)?.empresa ??
    funcionariosConsulta.find((f) => String(f.funcionario_id) === funcionarioId)
      ?.empresa ??
    null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const fid = Number(funcionarioId);
    if (!Number.isFinite(fid) || fid <= 0) {
      setFormError("Selecione o funcionário.");
      return;
    }
    if (precisaMarcacao) {
      const n = Number(nsr);
      if (!Number.isFinite(n) || n <= 0) {
        setFormError("Selecione a marcação original.");
        return;
      }
    }
    if (precisaHorario && !dataHora.trim()) {
      setFormError("Informe data e hora.");
      return;
    }
    if (motivo.trim().length < 5) {
      setFormError("Informe o motivo do ajuste (mínimo 5 caracteres).");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/ponto/tratamentos", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          funcionario_id: fid,
          nsr: precisaMarcacao ? Number(nsr) : null,
          data_hora: precisaHorario ? dataHora : null,
          motivo,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível gravar o ajuste.");
      onSalvo();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível gravar o ajuste.");
    } finally {
      setSaving(false);
    }
  }

  const tipoAjuda = TIPOS.find((t) => t.value === tipo)?.ajuda;

  return (
    <ModalBackdrop onBackdropClick={saving ? () => undefined : onClose}>
      <div className="modal-dialog modal-dialog-scrollable modal-ponto-ajuste" role="document">
        <div className="modal-content">
          <form onSubmit={(e) => void submit(e)}>
            <div className="modal-header">
              <h4 className="modal-title" id={titleId}>
                Ajustar ponto
              </h4>
              <button
                type="button"
                className="close"
                aria-label="Fechar"
                disabled={saving}
                onClick={onClose}
              >
                <span aria-hidden>×</span>
              </button>
            </div>
            <div className="modal-body">
              <p className="text-muted small">
                O registro original não é alterado. O ajuste fica no histórico de
                tratamentos, conforme a Portaria 671/2021.
              </p>
              {formError ? (
                <div className="alert alert-danger py-2">{formError}</div>
              ) : null}

              <div className="form-group">
                <label htmlFor="ponto-ajuste-tipo">Tipo de ajuste</label>
                <select
                  id="ponto-ajuste-tipo"
                  className="form-control"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoTratamentoPonto)}
                >
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {tipoAjuda ? (
                  <small className="form-text text-muted">{tipoAjuda}</small>
                ) : null}
              </div>

              <div className="form-group">
                <label htmlFor="ponto-ajuste-func">Funcionário</label>
                <select
                  id="ponto-ajuste-func"
                  className="form-control"
                  value={funcionarioId}
                  onChange={(e) => {
                    setFuncionarioId(e.target.value);
                    setNsr("");
                  }}
                >
                  <option value="">Selecione…</option>
                  {ativos.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                      {f.empresa ? ` — ${f.empresa}` : ""}
                      {!f.ativo ? " (inativo)" : ""}
                    </option>
                  ))}
                </select>
                {empresaSelecionada ? (
                  <small className="form-text text-muted">
                    Empresa: {empresaSelecionada}
                  </small>
                ) : null}
              </div>

              {precisaMarcacao ? (
                <div className="form-group">
                  <label htmlFor="ponto-ajuste-nsr">Marcação original</label>
                  <select
                    id="ponto-ajuste-nsr"
                    className="form-control"
                    value={nsr}
                    onChange={(e) => {
                      setNsr(e.target.value);
                      const sel = marcacoesOriginais.find(
                        (m) => String(m.nsr) === e.target.value,
                      );
                      if (sel && tipo === "CORRECAO_HORARIO") {
                        setDataHora(isoParaDatetimeLocal(sel.data_hora_fato));
                      }
                    }}
                  >
                    <option value="">Selecione…</option>
                    {marcacoesOriginais.length === 0 ? (
                      <option value="" disabled>
                        Nenhuma batida original neste dia
                      </option>
                    ) : (
                      marcacoesOriginais.map((m) => (
                        <option
                          key={`${m.empregador_id}-${m.nsr}`}
                          value={m.nsr ?? ""}
                          disabled={m.desconsiderada && tipo === "DESCONSIDERACAO"}
                        >
                          {fmtHora(m.data_hora_original ?? m.data_hora_fato)}
                          {m.desconsiderada ? " (desconsiderada)" : ""}
                          {m.origem === "CORRECAO_HORARIO" ? " (já corrigida)" : ""}
                          {m.nsr != null ? ` · NSR ${m.nsr}` : ""}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : null}

              {precisaHorario ? (
                <div className="form-group">
                  <label htmlFor="ponto-ajuste-quando">
                    {tipo === "INCLUSAO" ? "Data e hora incluídas" : "Novo horário"}
                  </label>
                  <input
                    id="ponto-ajuste-quando"
                    type="datetime-local"
                    className="form-control"
                    value={dataHora}
                    onChange={(e) => setDataHora(e.target.value)}
                  />
                </div>
              ) : null}

              <div className="form-group mb-0">
                <label htmlFor="ponto-ajuste-motivo">Motivo</label>
                <textarea
                  id="ponto-ajuste-motivo"
                  className="form-control"
                  rows={3}
                  maxLength={500}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: esquecimento de bater o ponto na saída"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-default"
                disabled={saving}
                onClick={onClose}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Gravando…" : "Gravar ajuste"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalBackdrop>
  );
}
