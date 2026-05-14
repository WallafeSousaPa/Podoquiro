"use client";

type ProcItem = {
  procedimento: string | null;
  valor_aplicado: number;
};

type PagItem = {
  forma: string | null;
  maquineta: string | null;
  valor_pago: number;
  status_pagamento: string;
};

export type CaixaAgendamentoRow = {
  id: number;
  id_usuario: number;
  data_hora_inicio: string;
  data_hora_fim: string;
  status: string;
  valor_bruto: number;
  desconto: number;
  valor_total: number;
  paciente_nome: string;
  profissional_nome: string;
  nome_sala: string;
  procedimentos: ProcItem[];
  pagamentos: PagItem[];
};

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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

function badgeStatusAgendamento(status: string) {
  const map: Record<string, string> = {
    pendente: "badge-warning",
    confirmado: "badge-primary",
    em_andamento: "badge-info",
    realizado: "badge-success",
    cancelado: "badge-secondary",
    faltou: "badge-secondary",
    adiado: "badge-primary",
  };
  const cls = map[status] ?? "badge-light";
  const label = status.replace(/_/g, " ");
  return <span className={`badge ${cls}`}>{label}</span>;
}

function badgeStatusPagamento(status: string) {
  const map: Record<string, string> = {
    pago: "badge-success",
    pendente: "badge-warning",
    estornado: "badge-danger",
  };
  const cls = map[status] ?? "badge-light";
  return <span className={`badge ${cls}`}>{status}</span>;
}

function fmtDiaRef(dataYmd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataYmd.trim());
  if (!m) return dataYmd;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  try {
    return new Date(y, mo - 1, d).toLocaleDateString("pt-BR", {
      dateStyle: "long",
    });
  } catch {
    return dataYmd;
  }
}

type Props = {
  rows: CaixaAgendamentoRow[];
  loadError?: string | null;
  loadingRows?: boolean;
  /** Data do filtro (AAAA-MM-DD), exibida no cabeçalho. */
  dataRef?: string;
  /** Clique no nome do paciente abre o modal do agendamento. */
  onPacienteClick?: (row: CaixaAgendamentoRow) => void;
  /** Recarrega a lista do dia (ex.: botão Atualizar). */
  onAtualizar?: () => void;
};

export function CaixaClient({
  rows,
  loadError,
  loadingRows = false,
  dataRef,
  onPacienteClick,
  onAtualizar,
}: Props) {
  if (loadError) {
    return (
      <div className="alert alert-danger" role="alert">
        {loadError}
      </div>
    );
  }

  return (
    <div className="card card-outline card-primary">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-start gap-2">
        <div className="flex-grow-1">
          <h3 className="card-title mb-0">Agendamentos e pagamentos</h3>
          {dataRef ? (
            <p className="text-muted small mb-0 mt-1">
              Dia <strong>{fmtDiaRef(dataRef)}</strong> — apenas agendamentos com status{" "}
              <strong>realizado</strong>, com início neste dia, em ordem de horário;
              pagamentos listados com o respectivo status. Clique no nome do paciente (em
              azul) para abrir o agendamento.
            </p>
          ) : null}
        </div>
        {onAtualizar ? (
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm flex-shrink-0"
            disabled={loadingRows}
            onClick={() => onAtualizar()}
          >
            {loadingRows ? "Atualizando…" : "Atualizar"}
          </button>
        ) : null}
      </div>
      <div className="card-body table-responsive p-0">
        <table className="table table-hover table-striped table-sm mb-0">
          <thead>
            <tr>
              <th style={{ width: "72px" }}>ID</th>
              <th style={{ minWidth: "130px" }}>Início</th>
              <th style={{ minWidth: "140px" }}>Paciente</th>
              <th style={{ minWidth: "120px" }}>Profissional</th>
              <th>Sala</th>
              <th style={{ width: "110px" }}>Status</th>
              <th className="text-right" style={{ minWidth: "88px" }}>
                Total
              </th>
              <th style={{ minWidth: "200px" }}>Procedimentos</th>
              <th style={{ minWidth: "220px" }}>Pagamentos</th>
            </tr>
          </thead>
          <tbody>
            {loadingRows ? (
              <tr>
                <td colSpan={9} className="text-center text-muted py-4">
                  <span
                    className="spinner-border spinner-border-sm mr-2 align-middle"
                    role="status"
                    aria-hidden
                  />
                  Carregando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-muted py-4">
                  Nenhum agendamento realizado neste dia.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td className="text-nowrap">{fmtDataHora(r.data_hora_inicio)}</td>
                  <td>
                    {onPacienteClick ? (
                      <button
                        type="button"
                        className="btn btn-link text-primary p-0 text-left caixa-paciente-link font-weight-normal border-0"
                        onClick={() => onPacienteClick(r)}
                      >
                        {r.paciente_nome}
                      </button>
                    ) : (
                      r.paciente_nome
                    )}
                  </td>
                  <td>{r.profissional_nome}</td>
                  <td>{r.nome_sala}</td>
                  <td>{badgeStatusAgendamento(r.status)}</td>
                  <td className="text-right text-nowrap font-weight-bold">
                    {fmtBrl(r.valor_total)}
                  </td>
                  <td className="small">
                    <ul className="list-unstyled mb-0">
                      {r.procedimentos.length === 0 ? (
                        <li className="text-muted">—</li>
                      ) : (
                        r.procedimentos.map((p, i) => (
                          <li key={i}>
                            {(p.procedimento ?? "Procedimento").trim()}{" "}
                            <span className="text-muted">
                              ({fmtBrl(p.valor_aplicado)})
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                    {r.desconto > 0 ? (
                      <div className="text-muted mt-1">
                        Bruto {fmtBrl(r.valor_bruto)} · Desc. {r.desconto}%
                      </div>
                    ) : null}
                  </td>
                  <td className="small">
                    {r.pagamentos.length === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <ul className="list-unstyled mb-0">
                        {r.pagamentos.map((p, i) => (
                          <li key={i} className="mb-1">
                            {fmtBrl(p.valor_pago)}{" "}
                            <span className="text-muted">
                              · {p.forma ?? "Forma"}
                              {p.maquineta ? ` · ${p.maquineta}` : ""}
                            </span>{" "}
                            {badgeStatusPagamento(p.status_pagamento)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
