"use client";

import { useCallback, useEffect, useState } from "react";
import type { IntervalosVagosData } from "@/lib/relatorios/intervalos-vagos";

function dataLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdMenosDias(ymd: string, dias: number): string {
  const [y, mo, da] = ymd.split("-").map((x) => Number(x));
  const d = new Date(y, mo - 1, da);
  d.setDate(d.getDate() - dias);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function fmtDataRef(ymd: string) {
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
  } catch {
    return ymd;
  }
}

function fmtDuracao(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0 && r > 0) return `${h}h ${r}min`;
  if (h > 0) return `${h}h`;
  return `${r}min`;
}

export function IntervalosVagosClient() {
  const hoje = dataLocalYmd();

  const [dataInicio, setDataInicio] = useState(() => ymdMenosDias(hoje, 30));
  const [dataFim, setDataFim] = useState(hoje);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<IntervalosVagosData | null>(null);
  const [expandido, setExpandido] = useState<Set<number>>(new Set());

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/relatorios/intervalos-vagos?data_inicio=${encodeURIComponent(
        dataInicio,
      )}&data_fim=${encodeURIComponent(dataFim)}`;
      const res = await fetch(url, { credentials: "include" });
      const j = (await res.json()) as { data?: IntervalosVagosData; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar relatório.");
      setData(j.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const aplicarPreset = (dias: number) => {
    setDataInicio(ymdMenosDias(hoje, dias));
    setDataFim(hoje);
  };

  const toggleExpandido = (id: number) => {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportarCsv = () => {
    if (!data) return;
    const linhas: string[] = [
      "Relatório de intervalos vagos",
      `Período;${fmtDataRef(data.periodo.data_inicio)};${fmtDataRef(data.periodo.data_fim)}`,
      "",
      "Profissional;Dias considerados;Tempo vago (min);Tempo atendido (min);Janela disponível (min);Média vago/dia (min);Ocupação %",
    ];
    for (const p of data.por_podologo) {
      linhas.push(
        `${p.nome};${p.dias_considerados};${p.minutos_vago_total};${p.minutos_atendido_total};${p.minutos_janela_total};${p.media_vago_dia};${p.ocupacao_percentual}`,
      );
    }
    linhas.push("", "Detalhe por dia", "Profissional;Data;Início;Fim;Vago (min);Atendido (min);Lacunas");
    for (const p of data.por_podologo) {
      for (const d of p.dias) {
        const lac = d.lacunas.map((l) => `${l.inicio}-${l.fim}`).join(" | ");
        linhas.push(
          `${p.nome};${fmtDataRef(d.data)};${d.horario_inicio};${d.horario_fim};${d.minutos_vago};${d.minutos_atendido};${lac}`,
        );
      }
    }
    const blob = new Blob(["\uFEFF" + linhas.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `intervalos-vagos-${data.periodo.data_inicio}-${data.periodo.data_fim}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="card card-outline card-primary">
        <div className="card-header">
          <h3 className="card-title">Filtros</h3>
        </div>
        <div className="card-body">
          <div className="form-row align-items-end">
            <div className="form-group col-sm-6 col-md-3">
              <label htmlFor="iv-data-inicio">Data início</label>
              <input
                id="iv-data-inicio"
                type="date"
                className="form-control"
                value={dataInicio}
                max={dataFim}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="form-group col-sm-6 col-md-3">
              <label htmlFor="iv-data-fim">Data fim</label>
              <input
                id="iv-data-fim"
                type="date"
                className="form-control"
                value={dataFim}
                min={dataInicio}
                max={hoje}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <div className="form-group col-12 col-md-6">
              <label className="d-block">Atalhos</label>
              <div className="btn-group btn-group-sm flex-wrap" role="group">
                <button type="button" className="btn btn-outline-secondary" onClick={() => aplicarPreset(0)}>
                  Hoje
                </button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => aplicarPreset(7)}>
                  7 dias
                </button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => aplicarPreset(30)}>
                  30 dias
                </button>
                <button type="button" className="btn btn-primary ml-2" onClick={() => void carregar()}>
                  <i className="fas fa-sync-alt mr-1" aria-hidden /> Atualizar
                </button>
                <button
                  type="button"
                  className="btn btn-outline-success ml-2"
                  onClick={exportarCsv}
                  disabled={!data || data.por_podologo.length === 0}
                >
                  <i className="fas fa-file-csv mr-1" aria-hidden /> CSV
                </button>
              </div>
            </div>
          </div>
          <p className="text-muted small mb-0">
            Dias sem nenhum agendamento para o profissional são ignorados (considera-se que ele
            não trabalhou). O intervalo (almoço) e o período bloqueado são descontados da janela.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      {loading ? (
        <div className="text-center text-muted py-5">
          <i className="fas fa-spinner fa-spin mr-2" aria-hidden /> Carregando…
        </div>
      ) : !data ? null : (
        <>
          <div className="row">
            <div className="col-sm-6 col-lg-3">
              <div className="small-box bg-info">
                <div className="inner">
                  <h3>{fmtDuracao(data.resumo.minutos_vago_total)}</h3>
                  <p>Tempo vago total</p>
                </div>
                <div className="icon">
                  <i className="fas fa-hourglass-half" aria-hidden />
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="small-box bg-success">
                <div className="inner">
                  <h3>{fmtDuracao(data.resumo.minutos_atendido_total)}</h3>
                  <p>Tempo atendido</p>
                </div>
                <div className="icon">
                  <i className="fas fa-user-check" aria-hidden />
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="small-box bg-secondary">
                <div className="inner">
                  <h3>{fmtDuracao(data.resumo.minutos_janela_total)}</h3>
                  <p>Janela disponível</p>
                </div>
                <div className="icon">
                  <i className="fas fa-business-time" aria-hidden />
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="small-box bg-primary">
                <div className="inner">
                  <h3>{data.resumo.podologos_considerados}</h3>
                  <p>Profissionais no período</p>
                </div>
                <div className="icon">
                  <i className="fas fa-users" aria-hidden />
                </div>
              </div>
            </div>
          </div>

          {data.resumo.podologos_sem_expediente > 0 ? (
            <div className="alert alert-warning">
              <i className="fas fa-exclamation-triangle mr-1" aria-hidden />
              {data.resumo.podologos_sem_expediente} profissional(is) com agendamentos no período
              não têm expediente cadastrado e ficaram fora do cálculo. Cadastre o expediente em
              Usuários para incluí-los.
            </div>
          ) : null}

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Tempo vago por profissional</h3>
            </div>
            <div className="card-body table-responsive p-0">
              <table className="table table-hover table-striped mb-0">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Profissional</th>
                    <th className="text-center">Dias</th>
                    <th className="text-right">Tempo vago</th>
                    <th className="text-right">Atendido</th>
                    <th className="text-right">Janela</th>
                    <th className="text-right">Média vago/dia</th>
                    <th className="text-right">Ocupação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_podologo.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        Nenhum agendamento no período.
                      </td>
                    </tr>
                  ) : (
                    data.por_podologo.map((p) => (
                      <FragmentoPodologo
                        key={p.id_usuario}
                        p={p}
                        aberto={expandido.has(p.id_usuario)}
                        onToggle={() => toggleExpandido(p.id_usuario)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function FragmentoPodologo({
  p,
  aberto,
  onToggle,
}: {
  p: IntervalosVagosData["por_podologo"][number];
  aberto: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr style={{ cursor: "pointer" }} onClick={onToggle}>
        <td className="text-center">
          <i className={`fas fa-chevron-${aberto ? "down" : "right"} text-muted`} aria-hidden />
        </td>
        <td>
          {p.nome}
          {p.sem_expediente ? (
            <span className="badge badge-warning ml-2">Sem expediente</span>
          ) : null}
        </td>
        <td className="text-center">{p.dias_considerados}</td>
        <td className="text-right font-weight-bold">
          {p.sem_expediente ? "—" : fmtDuracao(p.minutos_vago_total)}
        </td>
        <td className="text-right">{p.sem_expediente ? "—" : fmtDuracao(p.minutos_atendido_total)}</td>
        <td className="text-right">{p.sem_expediente ? "—" : fmtDuracao(p.minutos_janela_total)}</td>
        <td className="text-right">{p.sem_expediente ? "—" : fmtDuracao(p.media_vago_dia)}</td>
        <td className="text-right">{p.sem_expediente ? "—" : `${p.ocupacao_percentual}%`}</td>
      </tr>
      {aberto ? (
        <tr>
          <td colSpan={8} className="bg-light">
            {p.dias.length === 0 ? (
              <p className="text-muted small mb-0 px-2">Sem dias com agendamento.</p>
            ) : (
              <table className="table table-sm mb-0 bg-white">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th className="text-center">Expediente</th>
                    <th className="text-center">Agend.</th>
                    <th className="text-right">Atendido</th>
                    <th className="text-right">Vago</th>
                    <th>Lacunas (horários vagos)</th>
                  </tr>
                </thead>
                <tbody>
                  {p.dias.map((d) => (
                    <tr key={d.data}>
                      <td className="text-nowrap">{fmtDataRef(d.data)}</td>
                      <td className="text-center text-nowrap">
                        {p.sem_expediente ? "—" : `${d.horario_inicio}–${d.horario_fim}`}
                      </td>
                      <td className="text-center">{d.qtd_agendamentos}</td>
                      <td className="text-right">
                        {p.sem_expediente ? "—" : fmtDuracao(d.minutos_atendido)}
                      </td>
                      <td className="text-right font-weight-bold">
                        {p.sem_expediente ? "—" : fmtDuracao(d.minutos_vago)}
                      </td>
                      <td>
                        {p.sem_expediente ? (
                          <span className="text-muted small">Expediente não cadastrado</span>
                        ) : d.lacunas.length === 0 ? (
                          <span className="text-muted small">Sem lacunas</span>
                        ) : (
                          d.lacunas.map((l, i) => (
                            <span key={i} className="badge badge-info mr-1 mb-1">
                              {l.inicio}–{l.fim} ({fmtDuracao(l.minutos)})
                            </span>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
