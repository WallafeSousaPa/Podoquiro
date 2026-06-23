"use client";

import type { RelatorioAtendimentosData } from "@/lib/relatorios/atendimentos";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CORES = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#be185d",
  "#4b5563",
  "#65a30d",
  "#ea580c",
];

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDataCurta(ymd: string) {
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return ymd;
  }
}

function truncarNome(nome: string, max = 16) {
  const t = nome.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function TooltipCustom({
  active,
  payload,
  label,
  valorComoMoeda,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color?: string }[];
  label?: string;
  valorComoMoeda?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded shadow-sm p-2 small">
      {label ? <p className="mb-1 font-weight-bold">{label}</p> : null}
      {payload.map((p) => (
        <p key={p.name} className="mb-0" style={{ color: p.color }}>
          {p.name}:{" "}
          {valorComoMoeda && typeof p.value === "number" ? fmtBrl(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

type Props = { data: RelatorioAtendimentosData };

type ItemLegendaPizza = {
  cor: string;
  nome: string;
  nomeCompleto: string;
  value: number;
  percentual: number;
};

function LegendaPizzaLista({ itens }: { itens: ItemLegendaPizza[] }) {
  return (
    <ul
      className="relatorio-atendimentos-pie-legenda list-unstyled mb-0"
      aria-label="Legenda do gráfico"
    >
      {itens.map((item) => (
        <li key={item.nomeCompleto} className="relatorio-atendimentos-pie-legenda-item">
          <span
            className="relatorio-atendimentos-pie-swatch"
            style={{ backgroundColor: item.cor }}
            aria-hidden
          />
          <span className="relatorio-atendimentos-pie-legenda-texto">
            <span className="relatorio-atendimentos-pie-legenda-nome" title={item.nomeCompleto}>
              {item.nome}
            </span>
            <span className="text-muted">
              {item.value} ({item.percentual.toFixed(0)}%)
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function montarItensLegendaPizza(
  chartData: { name: string; nomeCompleto: string; value: number }[],
): ItemLegendaPizza[] {
  const total = chartData.reduce((s, d) => s + d.value, 0);
  return chartData.map((d, i) => ({
    cor: CORES[i % CORES.length]!,
    nome: d.name,
    nomeCompleto: d.nomeCompleto,
    value: d.value,
    percentual: total > 0 ? (d.value / total) * 100 : 0,
  }));
}

export function GraficoAtendimentosPorPodologo({ data }: Props) {
  const chartData = data.por_podologo.slice(0, 12).map((p) => ({
    nome: truncarNome(p.nome),
    nomeCompleto: p.nome,
    quantidade: p.quantidade,
    valor: p.valor_total,
  }));

  if (chartData.length === 0) {
    return <p className="text-muted small mb-0 text-center py-4">Sem dados no período.</p>;
  }

  return (
    <div
      className="relatorio-atendimentos-chart-wrap"
      role="img"
      aria-label="Gráfico de barras: quantidade de atendimentos por podólogo"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="nome" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={56} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip
            content={({ active, payload, label }) => (
              <TooltipCustom
                active={active}
                label={
                  payload?.[0]?.payload?.nomeCompleto
                    ? String(payload[0].payload.nomeCompleto)
                    : label != null
                      ? String(label)
                      : undefined
                }
                payload={payload?.map((p) => ({
                  name: String(p.name),
                  value: Number(p.value),
                  color: String(p.color),
                }))}
              />
            )}
          />
          <Legend />
          <Bar dataKey="quantidade" name="Atendimentos" fill={CORES[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoRetornos({ data }: Props) {
  const { resumo, por_podologo } = data.retornos;

  const resumoChart = [
    { nome: "Solicitados", quantidade: resumo.solicitados, fill: CORES[2]! },
    { nome: "Agendados", quantidade: resumo.agendados, fill: CORES[1]! },
    { nome: "Pendentes", quantidade: resumo.pendentes_agendamento, fill: CORES[3]! },
    { nome: "Curativos", quantidade: resumo.curativos_no_periodo, fill: CORES[5]! },
  ].filter((x) => x.quantidade > 0);

  const porPodologo = por_podologo.slice(0, 10).map((p) => ({
    nome: truncarNome(p.nome, 14),
    nomeCompleto: p.nome,
    solicitados: p.solicitados,
    agendados: p.agendados,
    pendentes: p.pendentes,
  }));

  if (
    resumo.solicitados === 0 &&
    resumo.curativos_no_periodo === 0 &&
    porPodologo.length === 0
  ) {
    return (
      <p className="text-muted small mb-0 text-center py-4">
        Nenhum retorno (curativo) registrado no período.
      </p>
    );
  }

  return (
    <div aria-label="Gráfico de retornos e curativos">
      {resumoChart.length > 0 ? (
        <>
          <p className="small text-muted mb-1">Resumo de retornos</p>
          <div
            className="relatorio-atendimentos-chart-wrap relatorio-atendimentos-chart-wrap--sm mb-3"
            role="img"
            aria-label="Resumo de retornos no período"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={resumoChart} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} interval={0} height={44} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
                <Tooltip
                  content={({ active, payload }) => (
                    <TooltipCustom
                      active={active}
                      label={
                        payload?.[0]?.payload?.nome
                          ? String(payload[0].payload.nome)
                          : undefined
                      }
                      payload={[{ name: "Quantidade", value: Number(payload?.[0]?.value) }]}
                    />
                  )}
                />
                <Bar dataKey="quantidade" name="Quantidade" radius={[4, 4, 0, 0]}>
                  {resumoChart.map((entry) => (
                    <Cell key={entry.nome} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}
      {porPodologo.length > 0 ? (
        <>
          <p className="small text-muted mb-1">Por podólogo (solicitações)</p>
          <div
            className="relatorio-atendimentos-chart-wrap"
            role="img"
            aria-label="Retornos solicitados por podólogo"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porPodologo} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="nome"
                  tick={{ fontSize: 10 }}
                  angle={-30}
                  textAnchor="end"
                  height={52}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip
                  content={({ active, payload }) => (
                    <TooltipCustom
                      active={active}
                      label={
                        payload?.[0]?.payload?.nomeCompleto
                          ? String(payload[0].payload.nomeCompleto)
                          : undefined
                      }
                      payload={payload?.map((p) => ({
                        name: String(p.name),
                        value: Number(p.value),
                        color: String(p.color),
                      }))}
                    />
                  )}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                <Bar dataKey="solicitados" name="Solicitados" fill={CORES[2]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="agendados" name="Já agendados" fill={CORES[1]} />
                <Bar dataKey="pendentes" name="Pendentes" fill={CORES[3]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function GraficoProcedimentosPizza({ data }: Props) {
  const top = data.por_procedimento.slice(0, 8);
  const restoQtd = data.por_procedimento
    .slice(8)
    .reduce((s, p) => s + p.quantidade, 0);
  const chartData = top.map((p) => ({
    name: truncarNome(p.nome, 22),
    nomeCompleto: p.nome,
    value: p.quantidade,
  }));
  if (restoQtd > 0) {
    chartData.push({ name: "Outros", nomeCompleto: "Outros procedimentos", value: restoQtd });
  }

  if (chartData.length === 0) {
    return <p className="text-muted small mb-0 text-center py-4">Sem procedimentos no período.</p>;
  }

  const legenda = montarItensLegendaPizza(chartData);

  return (
    <div className="relatorio-atendimentos-pie-layout">
      <div
        className="relatorio-atendimentos-chart-wrap relatorio-atendimentos-chart-wrap--pie-only"
        role="img"
        aria-label="Gráfico de pizza: distribuição de procedimentos"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="85%"
              label={false}
              labelLine={false}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={CORES[i % CORES.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => (
                <TooltipCustom
                  active={active}
                  label={
                    payload?.[0]?.payload?.nomeCompleto
                      ? String(payload[0].payload.nomeCompleto)
                      : undefined
                  }
                  payload={[{ name: "Quantidade", value: Number(payload?.[0]?.value) }]}
                />
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <LegendaPizzaLista itens={legenda} />
    </div>
  );
}

export function GraficoProdutosPizza({ data }: Props) {
  const top = data.por_produto.slice(0, 8);
  const restoQtd = data.por_produto.slice(8).reduce((s, p) => s + p.quantidade, 0);
  const chartData = top.map((p) => ({
    name: truncarNome(p.nome, 22),
    nomeCompleto: p.nome,
    value: p.quantidade,
  }));
  if (restoQtd > 0) {
    chartData.push({ name: "Outros", nomeCompleto: "Outros produtos", value: restoQtd });
  }

  if (chartData.length === 0) {
    return <p className="text-muted small mb-0 text-center py-4">Sem produtos no período.</p>;
  }

  const legenda = montarItensLegendaPizza(chartData);

  return (
    <div className="relatorio-atendimentos-pie-layout">
      <div
        className="relatorio-atendimentos-chart-wrap relatorio-atendimentos-chart-wrap--pie-only"
        role="img"
        aria-label="Gráfico de pizza: distribuição de produtos vendidos"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="85%"
              label={false}
              labelLine={false}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={CORES[i % CORES.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => (
                <TooltipCustom
                  active={active}
                  label={
                    payload?.[0]?.payload?.nomeCompleto
                      ? String(payload[0].payload.nomeCompleto)
                      : undefined
                  }
                  payload={[{ name: "Unidades", value: Number(payload?.[0]?.value) }]}
                />
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <LegendaPizzaLista itens={legenda} />
    </div>
  );
}

export function GraficoStatusPizza({ data }: Props) {
  const chartData = data.por_status.map((s) => ({
    name: s.rotulo,
    nomeCompleto: s.rotulo,
    value: s.quantidade,
  }));

  if (chartData.length === 0) {
    return <p className="text-muted small mb-0 text-center py-4">Sem atendimentos no período.</p>;
  }

  const legenda = montarItensLegendaPizza(chartData);

  return (
    <div className="relatorio-atendimentos-pie-layout">
      <div
        className="relatorio-atendimentos-chart-wrap relatorio-atendimentos-chart-wrap--pie-only"
        role="img"
        aria-label="Gráfico de pizza: atendimentos por status"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="85%"
              label={false}
              labelLine={false}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={CORES[i % CORES.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <LegendaPizzaLista itens={legenda} />
    </div>
  );
}

export function GraficoAtendimentosPorDia({ data }: Props) {
  const chartData = data.por_dia.map((d) => ({
    data: fmtDataCurta(d.data),
    dataCompleta: d.data,
    quantidade: d.quantidade,
    valor: d.valor_total,
  }));

  if (chartData.length === 0) {
    return <p className="text-muted small mb-0 text-center py-4">Sem dados diários.</p>;
  }

  return (
    <div
      className="relatorio-atendimentos-chart-wrap"
      role="img"
      aria-label="Gráfico de linha: atendimentos por dia"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="data" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip
            content={({ active, payload, label }) => (
              <TooltipCustom
                active={active}
                label={label != null ? String(label) : undefined}
                payload={payload?.map((p) => ({
                  name: String(p.name),
                  value: Number(p.value),
                }))}
              />
            )}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="quantidade"
            name="Atendimentos"
            stroke={CORES[0]}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
