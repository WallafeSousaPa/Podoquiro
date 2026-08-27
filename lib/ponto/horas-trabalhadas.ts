const TZ_PONTO = "America/Sao_Paulo";

export function ymdEmFusoPonto(isoOuDate: string | Date): string {
  const d = typeof isoOuDate === "string" ? new Date(isoOuDate) : isoOuDate;
  if (Number.isNaN(d.getTime())) {
    return typeof isoOuDate === "string" ? isoOuDate.slice(0, 10) : "";
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_PONTO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatarHorasTrabalhadas(minutos: number): string {
  const n = Number.isFinite(minutos) ? Math.max(0, Math.round(minutos)) : 0;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Soma os pares entrada/saída do dia (1ª–2ª, 3ª–4ª…).
 * Batida ímpar: se for hoje, conta até agora; em dia anterior fica em aberto.
 */
export function calcularHorasTrabalhadasDia(
  instantesIso: string[],
  dataYmd: string,
  agora: Date = new Date(),
): { minutos: number; emAberto: boolean; pares: number } {
  const instantes = instantesIso
    .map((iso) => new Date(iso).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  let minutos = 0;
  let pares = 0;
  for (let i = 0; i + 1 < instantes.length; i += 2) {
    minutos += Math.max(0, Math.round((instantes[i + 1] - instantes[i]) / 60_000));
    pares += 1;
  }

  const emAberto = instantes.length % 2 === 1;
  if (emAberto && ymdEmFusoPonto(agora) === dataYmd) {
    const ultima = instantes[instantes.length - 1];
    const agoraMs = agora.getTime();
    if (agoraMs > ultima) {
      minutos += Math.round((agoraMs - ultima) / 60_000);
    }
  }

  return { minutos, emAberto, pares };
}
