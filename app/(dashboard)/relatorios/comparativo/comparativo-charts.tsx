"use client";

import type { LinhaComparativa, RelatorioComparativoData } from "@/lib/relatorios/comparativo";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COR_PERIODO_A = "#6c757d";
const COR_PERIODO_B = "#2563eb";
const DATAKEY_A = "periodo_a";
const DATAKEY_B = "periodo_b";

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function truncarNome(nome: string, max = 14) {
  const t = nome.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function TooltipComparativo({
  active,
  payload,
  label,
  moeda,
}: {
  active?: boolean;
  payload?: readonly { value?: unknown; name?: string; color?: string }[];
  label?: string | number;
  moeda?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded shadow-sm p-2 small">
      {label != null && label !== "" ? (
        <p className="mb-1 font-weight-bold">{String(label)}</p>
      ) : null}
      {payload.map((p) => {
        const val = typeof p.value === "number" ? p.value : Number(p.value);
        const texto =
          moeda && Number.isFinite(val)
            ? fmtBrl(val)
            : Number.isFinite(val)
              ? val.toLocaleString("pt-BR")
              : String(p.value ?? "");
        return (
          <p key={p.name} className="mb-0" style={{ color: p.color }}>
            {p.name}: {texto}
          </p>
        );
      })}
    </div>
  );
}

function topLinhas(linhas: LinhaComparativa[], limit = 10, porValor = false): LinhaComparativa[] {
  return [...linhas]
    .sort((a, b) => {
      const maxA = porValor
        ? Math.max(a.valor_a, a.valor_b)
        : Math.max(a.quantidade_a, a.quantidade_b);
      const maxB = porValor
        ? Math.max(b.valor_a, b.valor_b)
        : Math.max(b.quantidade_a, b.quantidade_b);
      return maxB - maxA;
    })
    .slice(0, limit);
}

type Props = { data: RelatorioComparativoData };

function BarrasPeriodos({ data }: Props) {
  const nomeA = `A — ${data.periodo_a.periodo.rotulo}`;
  const nomeB = `B — ${data.periodo_b.periodo.rotulo}`;
  return (
    <>
      <Bar dataKey={DATAKEY_A} name={nomeA} fill={COR_PERIODO_A} radius={[4, 4, 0, 0]} />
      <Bar dataKey={DATAKEY_B} name={nomeB} fill={COR_PERIODO_B} radius={[4, 4, 0, 0]} />
    </>
  );
}

export function GraficoComparativoResumo({ data }: Props) {
  const chartData = [
    {
      metrica: "Atendimentos",
      periodo_a: data.periodo_a.atendimentos,
      periodo_b: data.periodo_b.atendimentos,
    },
    {
      metrica: "Procedimentos",
      periodo_a: data.periodo_a.procedimentos_qtd,
      periodo_b: data.periodo_b.procedimentos_qtd,
    },
    {
      metrica: "Produtos",
      periodo_a: data.periodo_a.produtos_qtd,
      periodo_b: data.periodo_b.produtos_qtd,
    },
  ];

  const temDados = chartData.some((d) => d.periodo_a > 0 || d.periodo_b > 0);
  if (!temDados) {
    return (
      <p className="text-muted small mb-0 text-center py-4">
        Sem dados de quantidade para comparar.
      </p>
    );
  }

  return (
    <div
      className="relatorio-atendimentos-chart-wrap"
      role="img"
      aria-label="Comparativo de quantidades entre períodos"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="metrica" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={36} />
          <Tooltip
            content={({ active, payload, label }) => (
              <TooltipComparativo
                active={active}
                label={label}
                payload={payload as unknown as readonly { value?: unknown; name?: string; color?: string }[] | undefined}
              />
            )}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <BarrasPeriodos data={data} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoComparativoValorTotal({ data }: Props) {
  const chartData = [
    {
      metrica: "Valor total",
      periodo_a: data.periodo_a.valor_total,
      periodo_b: data.periodo_b.valor_total,
    },
  ];

  if (data.periodo_a.valor_total === 0 && data.periodo_b.valor_total === 0) {
    return (
      <p className="text-muted small mb-0 text-center py-4">Sem faturamento nos períodos.</p>
    );
  }

  return (
    <div
      className="relatorio-atendimentos-chart-wrap relatorio-atendimentos-chart-wrap--sm"
      role="img"
      aria-label="Comparativo de valor total entre períodos"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="metrica" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 10 }}
            width={56}
            tickFormatter={(v) =>
              Number(v).toLocaleString("pt-BR", { notation: "compact", compactDisplay: "short" })
            }
          />
          <Tooltip
            content={({ active, payload, label }) => (
              <TooltipComparativo
                active={active}
                label={label}
                payload={payload as unknown as readonly { value?: unknown; name?: string; color?: string }[] | undefined}
                moeda
              />
            )}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <BarrasPeriodos data={data} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoComparativoTicketMedio({ data }: Props) {
  const chartData = [
    {
      metrica: "Ticket médio",
      periodo_a: data.periodo_a.ticket_medio,
      periodo_b: data.periodo_b.ticket_medio,
    },
  ];

  if (data.periodo_a.ticket_medio === 0 && data.periodo_b.ticket_medio === 0) {
    return (
      <p className="text-muted small mb-0 text-center py-4">Sem ticket médio nos períodos.</p>
    );
  }

  return (
    <div
      className="relatorio-atendimentos-chart-wrap relatorio-atendimentos-chart-wrap--sm"
      role="img"
      aria-label="Comparativo de ticket médio entre períodos"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="metrica" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v) => fmtBrl(Number(v))} />
          <Tooltip
            content={({ active, payload, label }) => (
              <TooltipComparativo
                active={active}
                label={label}
                payload={payload as unknown as readonly { value?: unknown; name?: string; color?: string }[] | undefined}
                moeda
              />
            )}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <BarrasPeriodos data={data} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type GraficoItensProps = {
  data: RelatorioComparativoData;
  linhas: LinhaComparativa[];
  tituloVazio: string;
  ariaLabel: string;
  moeda?: boolean;
};

function GraficoComparativoItens({
  data,
  linhas,
  tituloVazio,
  ariaLabel,
  moeda = false,
}: GraficoItensProps) {
  const top = topLinhas(linhas, 10, moeda);

  const chartData = top.map((r) => ({
    nome: truncarNome(r.nome),
    nomeCompleto: r.nome,
    periodo_a: moeda ? r.valor_a : r.quantidade_a,
    periodo_b: moeda ? r.valor_b : r.quantidade_b,
  }));

  if (chartData.length === 0) {
    return <p className="text-muted small mb-0 text-center py-4">{tituloVazio}</p>;
  }

  return (
    <div className="relatorio-atendimentos-chart-wrap" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="nome"
            tick={{ fontSize: 10 }}
            angle={-30}
            textAnchor="end"
            height={52}
          />
          <YAxis
            allowDecimals={!moeda}
            tick={{ fontSize: 10 }}
            width={moeda ? 56 : 36}
            tickFormatter={
              moeda
                ? (v) =>
                    Number(v).toLocaleString("pt-BR", {
                      notation: "compact",
                      compactDisplay: "short",
                    })
                : undefined
            }
          />
          <Tooltip
            content={({ active, payload }) => (
              <TooltipComparativo
                active={active}
                label={
                  payload?.[0]?.payload?.nomeCompleto
                    ? String(payload[0].payload.nomeCompleto)
                    : undefined
                }
                payload={payload as unknown as readonly { value?: unknown; name?: string; color?: string }[] | undefined}
                moeda={moeda}
              />
            )}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <BarrasPeriodos data={data} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoComparativoProcedimentos({ data }: Props) {
  return (
    <GraficoComparativoItens
      data={data}
      linhas={data.comparativo_procedimentos}
      tituloVazio="Nenhum procedimento nos períodos."
      ariaLabel="Comparativo de procedimentos por quantidade"
    />
  );
}

export function GraficoComparativoProdutos({ data }: Props) {
  return (
    <GraficoComparativoItens
      data={data}
      linhas={data.comparativo_produtos}
      tituloVazio="Nenhum produto nos períodos."
      ariaLabel="Comparativo de produtos por quantidade"
    />
  );
}

export function GraficoComparativoProcedimentosValor({ data }: Props) {
  return (
    <GraficoComparativoItens
      data={data}
      linhas={data.comparativo_procedimentos}
      tituloVazio="Nenhum procedimento nos períodos."
      ariaLabel="Comparativo de procedimentos por valor"
      moeda
    />
  );
}

export function GraficoComparativoProdutosValor({ data }: Props) {
  return (
    <GraficoComparativoItens
      data={data}
      linhas={data.comparativo_produtos}
      tituloVazio="Nenhum produto nos períodos."
      ariaLabel="Comparativo de produtos por valor"
      moeda
    />
  );
}
