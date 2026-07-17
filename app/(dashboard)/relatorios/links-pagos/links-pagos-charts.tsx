"use client";

import type { LinksPagosData } from "@/lib/relatorios/links-pagos";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CORES: Record<string, string> = {
  Cartão: "#2563eb",
  Dinheiro: "#16a34a",
  PIX: "#0d9488",
  Outros: "#64748b",
};

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Props = { data: LinksPagosData };

export function GraficoLinksPagosPorMeio({ data }: Props) {
  const chartData = data.por_meio.map((m) => ({
    meio: m.rotulo,
    valor: m.valor,
    quantidade: m.quantidade,
  }));

  const temDados = chartData.some((d) => d.valor > 0 || d.quantidade > 0);
  if (!temDados) {
    return (
      <p className="text-muted small mb-0 text-center py-4">
        Sem pagamentos no período para o gráfico.
      </p>
    );
  }

  return (
    <div
      className="relatorio-atendimentos-chart-wrap"
      role="img"
      aria-label="Valores pagos por meio: cartão, dinheiro, PIX e outros"
      style={{ height: "min(280px, 55vw)", minHeight: 200 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="meio" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 10 }}
            width={64}
            tickFormatter={(v) =>
              typeof v === "number"
                ? v.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 0,
                  })
                : String(v)
            }
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]?.payload as
                | { meio?: string; valor?: number; quantidade?: number }
                | undefined;
              if (!p) return null;
              return (
                <div className="bg-white border rounded shadow-sm p-2 small">
                  <p className="mb-1 font-weight-bold">{p.meio}</p>
                  <p className="mb-0">Valor: {fmtBrl(Number(p.valor ?? 0))}</p>
                  <p className="mb-0 text-muted">
                    {Number(p.quantidade ?? 0).toLocaleString("pt-BR")} pagamento(s)
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="valor" name="Valor" radius={[4, 4, 0, 0]}>
            {chartData.map((d) => (
              <Cell key={d.meio} fill={CORES[d.meio] ?? "#64748b"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
