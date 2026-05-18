"use client";

import { mensagemErroComCodigoSuporte } from "@/lib/aplicacao/mensagem-erro-com-codigo";
import { registrarErroViaApi } from "@/lib/aplicacao/registrar-erro-via-api";
import { STATUS_RETORNO_AGENDAMENTO } from "@/lib/agenda/retorno-agendamento";
import { type FormEvent, useCallback, useEffect, useId, useState } from "react";

type RespostaAgendamentoApi = {
  data?: { id?: number };
  id?: number;
  error?: string;
};

function extrairIdAgendamentoResposta(j: RespostaAgendamentoApi): number {
  return Number(j.data?.id ?? j.id);
}

async function mensagemErroComLog(
  origem: string,
  mensagemCurta: string,
  detalhe: Record<string, unknown>,
  idPaciente: number,
  prefixoUsuario: string,
): Promise<string> {
  const cod = await registrarErroViaApi({
    origem,
    mensagem_curta: mensagemCurta,
    detalhe: JSON.stringify(detalhe),
    id_paciente: idPaciente,
  });
  return cod != null
    ? mensagemErroComCodigoSuporte(prefixoUsuario, cod)
    : prefixoUsuario;
}

type SalaOpt = { id: number; nome: string };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function defaultInicioLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function horaFimPadraoDeInicio(inicioLocal: string): string {
  const d = new Date(inicioLocal);
  if (Number.isNaN(d.getTime())) return "10:30";
  d.setMinutes(d.getMinutes() + 30);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Data do início + hora de término (HH:mm); se fim ≤ início no mesmo dia, avança um dia. */
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

type Props = {
  open: boolean;
  idAgendamentoOrigem: number;
  idUsuario: number;
  idPaciente: number;
  /** Sala do atendimento original — pré-selecionada no dropdown. */
  idSalaPreferida?: number | null;
  pacienteNome: string;
  profissionalNome: string;
  onClose: () => void;
  /** ID do novo agendamento (curativo agendado). */
  onAgendado: (idRetorno: number) => void;
};

export function ModalAgendarRetornoCaixa({
  open,
  idAgendamentoOrigem,
  idUsuario,
  idPaciente,
  idSalaPreferida,
  pacienteNome,
  profissionalNome,
  onClose,
  onAgendado,
}: Props) {
  const titleId = useId();
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salas, setSalas] = useState<SalaOpt[]>([]);
  const [idSala, setIdSala] = useState("");
  const [inicioLocal, setInicioLocal] = useState(defaultInicioLocal);
  const [horaFimLocal, setHoraFimLocal] = useState(() =>
    horaFimPadraoDeInicio(defaultInicioLocal()),
  );
  const [observacoes, setObservacoes] = useState("Retorno — curativo agendado");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const sRes = await fetch("/api/salas", { credentials: "include" });
      const sJ = (await sRes.json()) as {
        data?: { id: number; nome_sala: string; ativo?: boolean }[];
        error?: string;
      };
      if (!sRes.ok) throw new Error(sJ.error ?? "Erro ao carregar salas.");
      const listaSalas = (sJ.data ?? [])
        .filter((s) => s.ativo !== false)
        .map((s) => ({ id: s.id, nome: String(s.nome_sala ?? "").trim() || `Sala #${s.id}` }));
      setSalas(listaSalas);
      const pref =
        idSalaPreferida != null &&
        Number.isFinite(idSalaPreferida) &&
        idSalaPreferida > 0 &&
        listaSalas.some((s) => s.id === idSalaPreferida)
          ? idSalaPreferida
          : listaSalas[0]?.id;
      setIdSala(pref != null ? String(pref) : "");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [idSalaPreferida]);

  useEffect(() => {
    if (!open) return;
    const ini = defaultInicioLocal();
    setInicioLocal(ini);
    setHoraFimLocal(horaFimPadraoDeInicio(ini));
    void carregar();
  }, [open, carregar]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const salaNum = Number(idSala);
    if (!Number.isFinite(salaNum) || salaNum <= 0) {
      setErro("Selecione a sala.");
      return;
    }
    const t0 = new Date(inicioLocal);
    const t1 = fimAPartirDeInicioEHora(inicioLocal, horaFimLocal);
    if (Number.isNaN(t0.getTime()) || Number.isNaN(t1.getTime()) || !horaFimLocal.trim()) {
      setErro("Informe início e horário de término válidos.");
      return;
    }
    if (t1.getTime() <= t0.getTime()) {
      setErro("O horário de término deve ser após o início.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const payloadPost = {
      id_usuario: idUsuario,
      id_paciente: idPaciente,
      id_sala: salaNum,
      data_hora_inicio: t0.toISOString(),
      data_hora_fim: t1.toISOString(),
      status: STATUS_RETORNO_AGENDAMENTO,
      desconto: 0,
      observacoes: observacoes.trim() || null,
    };
    try {
      const resNovo = await fetch("/api/agendamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payloadPost),
      });
      const rawNovo = await resNovo.text();
      let jNovo: RespostaAgendamentoApi = {};
      try {
        jNovo = rawNovo ? (JSON.parse(rawNovo) as RespostaAgendamentoApi) : {};
      } catch {
        const msg = await mensagemErroComLog(
          "modal-agendar-retorno-caixa:post_resposta_nao_json",
          "POST agendamento retorno — resposta não JSON",
          { status: resNovo.status, corpo: rawNovo.slice(0, 4000), payload: payloadPost },
          idPaciente,
          "Erro ao criar agendamento de retorno",
        );
        throw new Error(msg);
      }
      if (!resNovo.ok) {
        const msgApi = jNovo.error ?? "Erro ao criar agendamento de retorno.";
        const msg = await mensagemErroComLog(
          "modal-agendar-retorno-caixa:post_erro_http",
          msgApi,
          { status: resNovo.status, body: jNovo, payload: payloadPost },
          idPaciente,
          msgApi,
        );
        throw new Error(msg);
      }
      const idRetorno = extrairIdAgendamentoResposta(jNovo);
      if (!Number.isFinite(idRetorno) || idRetorno <= 0) {
        const msg = await mensagemErroComLog(
          "modal-agendar-retorno-caixa:post_sem_id",
          "POST agendamento retorno — resposta sem id",
          { status: resNovo.status, body: jNovo, payload: payloadPost },
          idPaciente,
          "Não foi possível criar o agendamento de retorno",
        );
        throw new Error(msg);
      }

      const resVinc = await fetch(`/api/agendamentos/${idAgendamentoOrigem}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id_retorno: idRetorno }),
      });
      const rawVinc = await resVinc.text();
      let jVinc: { error?: string } = {};
      try {
        jVinc = rawVinc ? (JSON.parse(rawVinc) as { error?: string }) : {};
      } catch {
        const msg = await mensagemErroComLog(
          "modal-agendar-retorno-caixa:patch_vinculo_nao_json",
          "PATCH vincular id_retorno — resposta não JSON",
          {
            status: resVinc.status,
            corpo: rawVinc.slice(0, 4000),
            id_agendamento_origem: idAgendamentoOrigem,
            id_retorno: idRetorno,
          },
          idPaciente,
          "Erro ao vincular retorno ao atendimento",
        );
        throw new Error(msg);
      }
      if (!resVinc.ok) {
        const msgApi = jVinc.error ?? "Erro ao vincular retorno ao atendimento.";
        const msg = await mensagemErroComLog(
          "modal-agendar-retorno-caixa:patch_vinculo_erro_http",
          msgApi,
          {
            status: resVinc.status,
            body: jVinc,
            id_agendamento_origem: idAgendamentoOrigem,
            id_retorno: idRetorno,
          },
          idPaciente,
          msgApi,
        );
        throw new Error(msg);
      }

      onAgendado(idRetorno);
    } catch (err) {
      if (err instanceof Error) {
        setErro(err.message);
      } else {
        const msg = await mensagemErroComLog(
          "modal-agendar-retorno-caixa:excecao",
          "Exceção ao agendar retorno",
          { erro: String(err), id_agendamento_origem: idAgendamentoOrigem },
          idPaciente,
          "Erro ao agendar retorno",
        );
        setErro(msg);
      }
    } finally {
      setSalvando(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block", zIndex: 1085 }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <form onSubmit={(e) => void salvar(e)}>
              <div className="modal-header">
                <h5 className="modal-title" id={titleId}>
                  Agendar retorno (curativo)
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
                    <p className="small text-muted mb-3">
                      Paciente: <strong>{pacienteNome}</strong> — Profissional:{" "}
                      <strong>{profissionalNome}</strong>
                    </p>
                    <p className="alert alert-info py-2 small mb-3">
                      O retorno será criado com status <strong>Curativo agendado</strong>, sem
                      procedimentos vinculados. Depois disso você poderá registrar o pagamento deste
                      atendimento.
                    </p>
                    {erro ? (
                      <div className="alert alert-danger py-2 small" role="alert">
                        {erro}
                      </div>
                    ) : null}
                    <div className="form-row">
                      <div className="form-group col-md-6">
                        <label>Início</label>
                        <input
                          type="datetime-local"
                          className="form-control"
                          value={inicioLocal}
                          onChange={(e) => {
                            setInicioLocal(e.target.value);
                            setHoraFimLocal(horaFimPadraoDeInicio(e.target.value));
                          }}
                          required
                          disabled={salvando}
                        />
                      </div>
                      <div className="form-group col-md-6">
                        <label>Término (hora)</label>
                        <input
                          type="time"
                          className="form-control"
                          value={horaFimLocal}
                          onChange={(e) => setHoraFimLocal(e.target.value)}
                          required
                          disabled={salvando}
                          title="A data do término é a mesma do início."
                        />
                        <small className="form-text text-muted">
                          Mesmo dia do início; se o horário for anterior ao início, considera o dia
                          seguinte.
                        </small>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Sala</label>
                      <select
                        className="form-control"
                        value={idSala}
                        onChange={(e) => setIdSala(e.target.value)}
                        disabled={salvando || salas.length === 0}
                        required
                      >
                        {salas.length === 0 ? (
                          <option value="">Nenhuma sala disponível</option>
                        ) : (
                          salas.map((s) => (
                            <option key={s.id} value={String(s.id)}>
                              {s.nome}
                            </option>
                          ))
                        )}
                      </select>
                      {idSalaPreferida != null &&
                      idSalaPreferida > 0 &&
                      idSala === String(idSalaPreferida) ? (
                        <p className="small text-muted mb-0 mt-1">
                          Mesma sala do atendimento que gerou o retorno.
                        </p>
                      ) : null}
                    </div>
                    <div className="form-group mb-0">
                      <label>Observações (opcional)</label>
                      <textarea
                        className="form-control"
                        rows={2}
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        disabled={salvando}
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={salvando}
                  onClick={onClose}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando || loading}>
                  {salvando ? "Salvando…" : "Salvar retorno e continuar pagamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: 1080 }}
        role="presentation"
        onClick={() => !salvando && onClose()}
      />
    </>
  );
}
